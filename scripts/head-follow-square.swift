#!/usr/bin/env swift

import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import Vision

enum HeadFollowError: Error, CustomStringConvertible {
  case usage
  case inputMatchesOutput
  case missingVideoTrack
  case invalidCropSide
  case cannotCreateReader
  case cannotCreateWriter
  case cannotCreatePixelBuffer

  var description: String {
    switch self {
    case .usage:
      return "usage: swift scripts/head-follow-square.swift <upright-bt709-input> <output-mov> [crop-side-px]"
    case .inputMatchesOutput:
      return "input and output paths must differ"
    case .missingVideoTrack:
      return "input has no video track"
    case .invalidCropSide:
      return "crop side must be positive and no larger than the input's short edge"
    case .cannotCreateReader:
      return "could not configure AVAssetReader"
    case .cannotCreateWriter:
      return "could not configure AVAssetWriter"
    case .cannotCreatePixelBuffer:
      return "could not allocate output pixel buffer"
    }
  }
}

func clamp(_ value: CGFloat, _ low: CGFloat, _ high: CGFloat) -> CGFloat {
  min(max(value, low), high)
}

func run() throws {
  guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 4 else {
    throw HeadFollowError.usage
  }

  let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
  guard inputURL.standardizedFileURL != outputURL.standardizedFileURL else {
    throw HeadFollowError.inputMatchesOutput
  }

  let asset = AVURLAsset(url: inputURL)
  guard let track = asset.tracks(withMediaType: .video).first else {
    throw HeadFollowError.missingVideoTrack
  }

  // This script intentionally expects orientation to be baked during ingest.
  // Tracking coordinates, crop geometry, and output pixels then share one space.
  let width = Int(track.naturalSize.width)
  let height = Int(track.naturalSize.height)
  let shortEdge = min(width, height)
  let requestedSide: Int
  if CommandLine.arguments.count == 4 {
    guard let parsed = Int(CommandLine.arguments[3]) else {
      throw HeadFollowError.invalidCropSide
    }
    requestedSide = parsed
  } else {
    requestedSide = Int((Double(shortEdge) * 0.84).rounded())
  }
  guard requestedSide > 0 && requestedSide <= shortEdge else {
    throw HeadFollowError.invalidCropSide
  }
  let cropSide = CGFloat(requestedSide)
  let outputSide = shortEdge
  let durationSec = max(CMTimeGetSeconds(asset.duration), 0.001)
  try? FileManager.default.removeItem(at: outputURL)

  let reader = try AVAssetReader(asset: asset)
  let readerOutput = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
  )
  readerOutput.alwaysCopiesSampleData = false
  guard reader.canAdd(readerOutput) else { throw HeadFollowError.cannotCreateReader }
  reader.add(readerOutput)

  let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
  let videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: outputSide,
    AVVideoHeightKey: outputSide,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 16_000_000,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoAllowFrameReorderingKey: false,
    ],
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
      kCVPixelBufferWidthKey as String: outputSide,
      kCVPixelBufferHeightKey as String: outputSide,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:],
    ]
  )
  guard writer.canAdd(writerInput) else { throw HeadFollowError.cannotCreateWriter }
  writer.add(writerInput)

  let request = VNDetectFaceRectanglesRequest()
  let handler = VNSequenceRequestHandler()
  let outputColorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  let context = CIContext(options: [
    .cacheIntermediates: false,
    .workingColorSpace: outputColorSpace,
  ])

  guard reader.startReading(), writer.startWriting() else {
    throw reader.error ?? writer.error ?? HeadFollowError.cannotCreateWriter
  }
  writer.startSession(atSourceTime: .zero)

  var smoothCenter: CGPoint?
  var frameCount = 0
  var detectionFrames = 0
  var missedFrames = 0
  var xClampFrames = 0
  var yClampFrames = 0
  var lastProgress = -1

  while let sample = readerOutput.copyNextSampleBuffer() {
    autoreleasepool {
      guard let sourceBuffer = CMSampleBufferGetImageBuffer(sample) else { return }
      let source = CIImage(cvPixelBuffer: sourceBuffer)
      let extent = source.extent
      let timestamp = CMSampleBufferGetPresentationTimeStamp(sample)
      let time = CMTimeGetSeconds(timestamp)

      do {
        try handler.perform([request], on: sourceBuffer, orientation: .up)
      } catch {
        FileHandle.standardError.write(Data("head-follow vision warning: \(error)\n".utf8))
      }

      if let face = request.results?.max(by: {
        $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
      }) {
        detectionFrames += 1
        let normalized = face.boundingBox
        let faceRect = CGRect(
          x: normalized.minX * extent.width,
          y: normalized.minY * extent.height,
          width: normalized.width * extent.width,
          height: normalized.height * extent.height
        )
        // Vision's face box excludes some hair. A small upward bias centers the
        // visible head rather than the nose/mouth mass.
        let target = CGPoint(
          x: faceRect.midX,
          y: faceRect.midY + faceRect.height * 0.08
        )

        if let prior = smoothCenter {
          let distance = hypot(target.x - prior.x, target.y - prior.y)
          let adaptiveBoost = min(0.22, distance / max(cropSide * 1.8, 1))
          let alpha = 0.22 + adaptiveBoost
          smoothCenter = CGPoint(
            x: prior.x + (target.x - prior.x) * alpha,
            y: prior.y + (target.y - prior.y) * alpha
          )
        } else {
          smoothCenter = target
        }
      } else {
        missedFrames += 1
      }

      let desired = smoothCenter ?? CGPoint(x: extent.midX, y: extent.midY)
      let half = cropSide / 2
      let clampedX = clamp(desired.x, extent.minX + half, extent.maxX - half)
      let clampedY = clamp(desired.y, extent.minY + half, extent.maxY - half)
      if abs(clampedX - desired.x) > 0.5 { xClampFrames += 1 }
      if abs(clampedY - desired.y) > 0.5 { yClampFrames += 1 }

      let crop = CGRect(
        x: clampedX - half,
        y: clampedY - half,
        width: cropSide,
        height: cropSide
      )
      let scale = CGFloat(outputSide) / cropSide
      let square = source
        .cropped(to: crop)
        .transformed(by: CGAffineTransform(translationX: -crop.minX, y: -crop.minY))
        .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        .cropped(to: CGRect(x: 0, y: 0, width: outputSide, height: outputSide))

      var outputBuffer: CVPixelBuffer?
      guard let pool = adaptor.pixelBufferPool,
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &outputBuffer) == kCVReturnSuccess,
            let outputBuffer else { return }
      context.render(
        square,
        to: outputBuffer,
        bounds: CGRect(x: 0, y: 0, width: outputSide, height: outputSide),
        colorSpace: outputColorSpace
      )

      while !writerInput.isReadyForMoreMediaData {
        Thread.sleep(forTimeInterval: 0.002)
      }
      guard adaptor.append(outputBuffer, withPresentationTime: timestamp) else { return }

      frameCount += 1
      let progress = min(100, Int((time / durationSec) * 100))
      if progress >= lastProgress + 5 {
        lastProgress = progress
        FileHandle.standardError.write(Data("head-follow: \(progress)%\n".utf8))
      }
    }
  }

  guard reader.status == .completed else {
    throw reader.error ?? HeadFollowError.cannotCreateReader
  }
  writerInput.markAsFinished()
  let semaphore = DispatchSemaphore(value: 0)
  writer.finishWriting { semaphore.signal() }
  semaphore.wait()
  guard writer.status == .completed else {
    throw writer.error ?? HeadFollowError.cannotCreateWriter
  }

  FileHandle.standardError.write(Data(
    "head-follow: wrote \(frameCount) frames; detections=\(detectionFrames), misses=\(missedFrames), x-clamped=\(xClampFrames), y-clamped=\(yClampFrames)\n".utf8
  ))
}

do {
  try run()
} catch {
  FileHandle.standardError.write(Data("head-follow: \(error)\n".utf8))
  exit(1)
}
