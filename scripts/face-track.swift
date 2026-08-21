#!/usr/bin/env swift

// Emit a per-frame face track as JSON. Pixels are never written here: tracking
// is preprocessing, and what a template does with the track (a follow crop, a
// corner bubble, a blur-the-rest mask) is a rendering decision that belongs in
// the spec. head-follow-square.swift bakes one such decision; this exports the
// data behind all of them.
//
//   swift scripts/face-track.swift <upright-bt709-input> <output-json>
//
// Output: { width, height, fps, frames, track: [[x, y, size], ...] }
// x, y are the head center and size is the face box height, all normalized to
// the frame with a top-left origin, one entry per decoded frame.

import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import Vision

enum FaceTrackError: Error, CustomStringConvertible {
  case usage
  case missingVideoTrack
  case cannotCreateReader
  case noFramesDecoded
  case noFaceInClip

  var description: String {
    switch self {
    case .usage:
      return "usage: swift scripts/face-track.swift <upright-bt709-input> <output-json>"
    case .missingVideoTrack: return "input has no video track"
    case .cannotCreateReader: return "could not configure AVAssetReader"
    case .noFramesDecoded: return "input decoded zero frames"
    case .noFaceInClip: return "no face detected anywhere in the clip"
    }
  }
}

func clamp(_ value: CGFloat, _ low: CGFloat, _ high: CGFloat) -> CGFloat {
  min(max(value, low), high)
}

func run() throws {
  guard CommandLine.arguments.count == 3 else { throw FaceTrackError.usage }
  let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

  let asset = AVURLAsset(url: inputURL)
  guard let track = asset.tracks(withMediaType: .video).first else {
    throw FaceTrackError.missingVideoTrack
  }

  // Orientation is expected to be baked during ingest, so tracking coordinates
  // and the renderer's pixels share one space.
  let width = CGFloat(track.naturalSize.width)
  let height = CGFloat(track.naturalSize.height)
  let fps = Double(track.nominalFrameRate)

  let reader = try AVAssetReader(asset: asset)
  let readerOutput = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
  )
  readerOutput.alwaysCopiesSampleData = false
  guard reader.canAdd(readerOutput) else { throw FaceTrackError.cannotCreateReader }
  reader.add(readerOutput)

  let request = VNDetectFaceRectanglesRequest()
  let handler = VNSequenceRequestHandler()
  guard reader.startReading() else { throw reader.error ?? FaceTrackError.cannotCreateReader }

  // Smoothed center in Vision's bottom-left space, plus the raw per-frame
  // samples. Frames before the first detection get back-filled afterwards, so
  // a clip that opens on a turned head still starts on the right anchor
  // instead of drifting in from frame center.
  var smoothCenter: CGPoint?
  var smoothSize: CGFloat?
  var samples: [(x: CGFloat, y: CGFloat, size: CGFloat)?] = []
  var detectionFrames = 0

  while let sample = readerOutput.copyNextSampleBuffer() {
    autoreleasepool {
      guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
      do {
        try handler.perform([request], on: buffer, orientation: .up)
      } catch {
        FileHandle.standardError.write(Data("face-track vision warning: \(error)\n".utf8))
      }

      if let face = request.results?.max(by: {
        $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
      }) {
        detectionFrames += 1
        let box = face.boundingBox
        let faceHeight = box.height * height
        // Vision's box stops below the hairline. The same upward bias
        // head-follow-square uses centers the visible head, not the nose.
        let target = CGPoint(
          x: box.midX * width,
          y: box.midY * height + faceHeight * 0.08
        )

        if let prior = smoothCenter {
          // Critically damped follow: a fixed lerp lags a fast turn and a fast
          // lerp transmits detector jitter, so the gain rises with distance.
          let distance = hypot(target.x - prior.x, target.y - prior.y)
          let alpha = 0.22 + min(0.22, distance / max(faceHeight * 1.8, 1))
          smoothCenter = CGPoint(
            x: prior.x + (target.x - prior.x) * alpha,
            y: prior.y + (target.y - prior.y) * alpha
          )
        } else {
          smoothCenter = target
        }
        smoothSize = smoothSize.map { $0 + (faceHeight - $0) * 0.18 } ?? faceHeight
      }

      if let center = smoothCenter, let size = smoothSize {
        samples.append((x: center.x, y: center.y, size: size))
      } else {
        samples.append(nil)
      }
    }
  }

  if let error = reader.error { throw error }
  guard !samples.isEmpty else { throw FaceTrackError.noFramesDecoded }
  guard let firstKnown = samples.first(where: { $0 != nil }) ?? nil else {
    throw FaceTrackError.noFaceInClip
  }

  let rows: [[Double]] = samples.map { sample in
    let s = sample ?? firstKnown
    // Vision's origin is bottom-left; the renderer's is top-left.
    return [
      Double(clamp(s.x / width, 0, 1)),
      Double(clamp(1 - s.y / height, 0, 1)),
      Double(clamp(s.size / height, 0, 1)),
    ].map { (($0 * 100_000).rounded() / 100_000) }
  }

  let payload: [String: Any] = [
    "width": Int(width),
    "height": Int(height),
    "fps": fps,
    "frames": rows.count,
    "detectionFrames": detectionFrames,
    "track": rows,
  ]
  let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
  try data.write(to: outputURL)

  let missed = rows.count - detectionFrames
  FileHandle.standardError.write(
    Data("face-track: \(rows.count) frames, \(detectionFrames) detected, \(missed) held\n".utf8)
  )
}

do {
  try run()
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}
