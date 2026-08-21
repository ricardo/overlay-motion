#!/usr/bin/env swift

import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import Vision

enum RenderError: Error, CustomStringConvertible {
  case usage
  case missingVideoTrack
  case cannotCreateReader
  case cannotCreateWriter
  case cannotCreatePixelBuffer
  case segmentationFailed

  var description: String {
    switch self {
    case .usage:
      return "usage: swift scripts/person-gradient.swift <input-video> <output-mov>"
    case .missingVideoTrack:
      return "input has no video track"
    case .cannotCreateReader:
      return "could not add the video output to AVAssetReader"
    case .cannotCreateWriter:
      return "could not add the video input to AVAssetWriter"
    case .cannotCreatePixelBuffer:
      return "could not allocate an output pixel buffer"
    case .segmentationFailed:
      return "Vision did not return a person segmentation mask"
    }
  }
}

func gradient(extent: CGRect) -> CIImage {
  let filter = CIFilter(name: "CILinearGradient")!
  filter.setValue(CIVector(x: extent.minX, y: extent.maxY), forKey: "inputPoint0")
  filter.setValue(CIVector(x: extent.maxX, y: extent.minY), forKey: "inputPoint1")
  filter.setValue(CIColor(red: 0.31, green: 0.075, blue: 0.48, alpha: 1), forKey: "inputColor0")
  filter.setValue(CIColor(red: 0.035, green: 0.008, blue: 0.075, alpha: 1), forKey: "inputColor1")
  return filter.outputImage!.cropped(to: extent)
}

func run() throws {
  guard CommandLine.arguments.count == 3 else { throw RenderError.usage }

  let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
  try? FileManager.default.removeItem(at: outputURL)

  let asset = AVURLAsset(url: inputURL)
  guard let track = asset.tracks(withMediaType: .video).first else {
    throw RenderError.missingVideoTrack
  }

  let naturalSize = track.naturalSize.applying(track.preferredTransform)
  let width = Int(abs(naturalSize.width))
  let height = Int(abs(naturalSize.height))
  let durationSec = max(CMTimeGetSeconds(asset.duration), 0.001)

  let reader = try AVAssetReader(asset: asset)
  let readerOutput = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
  )
  readerOutput.alwaysCopiesSampleData = false
  guard reader.canAdd(readerOutput) else { throw RenderError.cannotCreateReader }
  reader.add(readerOutput)

  let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
  let compression: [String: Any] = [
    AVVideoAverageBitRateKey: 14_000_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoAllowFrameReorderingKey: false,
  ]
  let videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: compression,
    AVVideoColorPropertiesKey: [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
  ]
  let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
  writerInput.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: writerInput,
    sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:],
    ]
  )
  guard writer.canAdd(writerInput) else { throw RenderError.cannotCreateWriter }
  writer.add(writerInput)

  let request = VNGeneratePersonSegmentationRequest()
  request.qualityLevel = .accurate
  request.outputPixelFormat = kCVPixelFormatType_OneComponent8
  let requestHandler = VNSequenceRequestHandler()
  let context = CIContext(options: [
    .cacheIntermediates: false,
    .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
  ])
  let outputColorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

  guard reader.startReading(), writer.startWriting() else {
    throw reader.error ?? writer.error ?? RenderError.cannotCreateWriter
  }
  writer.startSession(atSourceTime: .zero)

  var frameCount = 0
  var lastProgress = -1
  while let sample = readerOutput.copyNextSampleBuffer() {
    autoreleasepool {
      guard let sourceBuffer = CMSampleBufferGetImageBuffer(sample) else { return }
      do {
        try requestHandler.perform([request], on: sourceBuffer, orientation: .up)
        guard let maskBuffer = request.results?.first?.pixelBuffer else {
          throw RenderError.segmentationFailed
        }

        let source = CIImage(cvPixelBuffer: sourceBuffer)
        let extent = source.extent
        let rawMask = CIImage(cvPixelBuffer: maskBuffer)
        let scale = CGAffineTransform(
          scaleX: extent.width / rawMask.extent.width,
          y: extent.height / rawMask.extent.height
        )
        let protectedMask = rawMask
          .transformed(by: scale)
          .applyingFilter("CIMorphologyMaximum", parameters: ["inputRadius": 1.5])
          .clampedToExtent()
          .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.15])
          .cropped(to: extent)
        let composite = source.applyingFilter(
          "CIBlendWithMask",
          parameters: [
            kCIInputBackgroundImageKey: gradient(extent: extent),
            kCIInputMaskImageKey: protectedMask,
          ]
        )

        var outputBuffer: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool,
              CVPixelBufferPoolCreatePixelBuffer(nil, pool, &outputBuffer) == kCVReturnSuccess,
              let outputBuffer else {
          throw RenderError.cannotCreatePixelBuffer
        }
        context.render(composite, to: outputBuffer, bounds: extent, colorSpace: outputColorSpace)

        while !writerInput.isReadyForMoreMediaData {
          Thread.sleep(forTimeInterval: 0.002)
        }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sample)
        guard adaptor.append(outputBuffer, withPresentationTime: timestamp) else {
          throw writer.error ?? RenderError.cannotCreateWriter
        }

        frameCount += 1
        let progress = min(100, Int((CMTimeGetSeconds(timestamp) / durationSec) * 100))
        if progress >= lastProgress + 5 {
          lastProgress = progress
          FileHandle.standardError.write(Data("person-gradient: \(progress)%\n".utf8))
        }
      } catch {
        FileHandle.standardError.write(Data("person-gradient error: \(error)\n".utf8))
        reader.cancelReading()
        writer.cancelWriting()
      }
    }
    if reader.status == .cancelled { break }
  }

  guard reader.status == .completed else {
    throw reader.error ?? RenderError.segmentationFailed
  }
  writerInput.markAsFinished()
  let semaphore = DispatchSemaphore(value: 0)
  writer.finishWriting { semaphore.signal() }
  semaphore.wait()
  guard writer.status == .completed else {
    throw writer.error ?? RenderError.cannotCreateWriter
  }
  FileHandle.standardError.write(Data("person-gradient: wrote \(frameCount) frames\n".utf8))
}

do {
  try run()
} catch {
  FileHandle.standardError.write(Data("person-gradient: \(error)\n".utf8))
  exit(1)
}
