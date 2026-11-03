// Makes ObsidianCode's Android icons from the owner's drawing (icon/drawing.png): the coloured
// strokes are cut out of the black square and placed on standard canvases.
// Usage: swift icon/make-icons.swift icon/drawing.png overlay/apps/mobile/assets/obsidiancode
import AppKit
import CoreGraphics

let args = CommandLine.arguments
guard args.count == 3, let source = NSImage(contentsOfFile: args[1]),
  let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { fatalError("usage: make-icons.swift <drawing.png> <output dir>") }
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let w = cg.width, h = cg.height
let space = CGColorSpace(name: CGColorSpace.sRGB)!
func bitmap(_ width: Int, _ height: Int) -> CGContext {
  CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}
let src = bitmap(w, h)
src.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
let px = src.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)

// The strokes are coloured; the square (black), the page (white) and their edges (grey) aren't.
// Each pixel's opacity comes from how coloured it is; its colour is taken back out from over black.
let art = bitmap(w, h)
let out = art.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
var minX = w, minY = h, maxX = 0, maxY = 0
for i in 0..<(w * h) {
  let r = Double(px[i * 4]), g = Double(px[i * 4 + 1]), b = Double(px[i * 4 + 2])
  let saturation = max(r, g, b) - min(r, g, b)
  let alpha = min(1, max(0, (saturation - 18) / 30))
  if alpha <= 0 { continue }
  // Premultiplied over black: the stored colour is the pixel itself, capped by alpha.
  out[i * 4] = UInt8(min(r, 255 * alpha))
  out[i * 4 + 1] = UInt8(min(g, 255 * alpha))
  out[i * 4 + 2] = UInt8(min(b, 255 * alpha))
  out[i * 4 + 3] = UInt8(255 * alpha)
  let x = i % w, y = i / w
  minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
}
let artImage = art.makeImage()!
// Bitmap rows start at the top; CoreGraphics' y axis starts at the bottom.
let crop = artImage.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1))!
let cw = Double(crop.width), ch = Double(crop.height)

// Draws the art centred, scaled so its diagonal is `diagonal` pixels (fits inside a circle that size).
func place(_ ctx: CGContext, size: Int, diagonal: Double, white: Bool = false) {
  let scale = diagonal / (cw * cw + ch * ch).squareRoot()
  let dw = cw * scale, dh = ch * scale
  let rect = CGRect(x: (Double(size) - dw) / 2, y: (Double(size) - dh) / 2, width: dw, height: dh)
  ctx.interpolationQuality = .high
  if white {
    ctx.saveGState()
    ctx.clip(to: rect, mask: crop)
    ctx.setFillColor(CGColor(gray: 1, alpha: 1))
    ctx.fill(rect)
    ctx.restoreGState()
  } else {
    ctx.draw(crop, in: rect)
  }
}
func save(_ ctx: CGContext, _ name: String) {
  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  try! rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent(name))
  print("wrote \(name)")
}

// Adaptive icon layers (108dp = 432px; launchers show at least the central 66dp circle = 264px).
let foreground = bitmap(432, 432)
place(foreground, size: 432, diagonal: 270)
save(foreground, "android-icon-foreground.png")

let monochrome = bitmap(432, 432)
place(monochrome, size: 432, diagonal: 270, white: true)
save(monochrome, "android-icon-monochrome.png")

// Older Android (before adaptive icons): a black rounded square.
let legacy = bitmap(1024, 1024)
legacy.addPath(CGPath(roundedRect: CGRect(x: 32, y: 32, width: 960, height: 960), cornerWidth: 200, cornerHeight: 200, transform: nil))
legacy.setFillColor(CGColor(gray: 0, alpha: 1))
legacy.fillPath()
place(legacy, size: 1024, diagonal: 820)
save(legacy, "icon.png")

// Launch screen (Android 12+ shows the central two thirds of the canvas as a circle): art on a
// black disc, so it looks the same on the light and dark launch backgrounds.
let splash = bitmap(1152, 1152)
splash.setFillColor(CGColor(gray: 0, alpha: 1))
splash.fillEllipse(in: CGRect(x: 192, y: 192, width: 768, height: 768))
place(splash, size: 1152, diagonal: 560)
save(splash, "android-splash-icon.png")
