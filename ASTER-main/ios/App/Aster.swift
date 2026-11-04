// The ASTER look, ported from the desktop's `--aster-*` tokens and `.aster-*`
// surfaces in `src/styles.css`: the atmosphere behind every screen, the
// brand's blue-violet, the star, and the companion that floats on the home
// of an empty conversation.
//
// The desktop paints it over its two default skins, Midnight and Daylight.
// The phone has no skins — it follows the system's appearance — so dark
// reads Midnight's atmosphere and light reads Daylight's.
import SwiftUI

/// The `--aster-*` tokens, one set per appearance.
struct AsterPalette {
    let ground: Color
    let violet: Color
    let blue: Color
    let glassFill: Color
    let glassBorder: Color
    let glassHighlight: Color

    static let midnight = AsterPalette(
        ground: Color(red: 11 / 255, green: 13 / 255, blue: 42 / 255),
        violet: Color(red: 169 / 255, green: 155 / 255, blue: 1),
        blue: Color(red: 139 / 255, green: 155 / 255, blue: 1),
        glassFill: Color(red: 28 / 255, green: 30 / 255, blue: 74 / 255).opacity(0.34),
        glassBorder: Color(red: 170 / 255, green: 176 / 255, blue: 1).opacity(0.16),
        glassHighlight: Color.white.opacity(0.10)
    )
    static let daylight = AsterPalette(
        ground: Color(red: 246 / 255, green: 241 / 255, blue: 236 / 255),
        violet: Color(red: 139 / 255, green: 124 / 255, blue: 246 / 255),
        blue: Color(red: 122 / 255, green: 167 / 255, blue: 1),
        glassFill: Color.white.opacity(0.36),
        glassBorder: Color.white.opacity(0.72),
        glassHighlight: Color.white.opacity(0.9)
    )

    static func of(_ scheme: ColorScheme) -> AsterPalette {
        scheme == .dark ? .midnight : .daylight
    }

    /// `.aster-send` and `.aster-gradient-text`: violet into blue.
    var accent: LinearGradient {
        LinearGradient(colors: [violet, blue], startPoint: .leading, endPoint: .trailing)
    }
}

/// `.glass-ground` on the ASTER skins: the ground, the desktop's wallpaper
/// under a wash, and soft planets rising from the edges. Static paint;
/// nothing here animates. Reduce Transparency keeps the plain ground, as
/// `prefers-reduced-transparency` does on the desktop.
struct AsterBackdrop: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let ground = AsterPalette.of(colorScheme).ground
        Group {
            if reduceTransparency {
                ground
            } else {
                ground
                    .overlay(Image(decorative: "AsterWallpaper").resizable().scaledToFill())
                    .overlay(atmosphere)
                    .clipped()
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var atmosphere: some View {
        let dark = colorScheme == .dark
        return Canvas { canvas, size in
            let w = size.width, h = size.height, unit = min(w, h)
            func planet(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat, _ stops: [(Double, Double, Double, Double, CGFloat)]) {
                canvas.fill(
                    Path(CGRect(origin: .zero, size: size)),
                    with: .radialGradient(
                        Gradient(stops: stops.map { stop in
                            Gradient.Stop(color: Color(red: stop.0 / 255, green: stop.1 / 255, blue: stop.2 / 255).opacity(stop.3), location: stop.4)
                        } + [.init(color: .clear, location: 1)]),
                        center: CGPoint(x: x, y: y), startRadius: 0, endRadius: radius
                    )
                )
            }
            // The wash that pulls the wallpaper toward the palette, then the
            // planets, painted bottom layer first as the CSS lists them last.
            let all = Path(CGRect(origin: .zero, size: size))
            if dark {
                canvas.fill(all, with: .linearGradient(
                    Gradient(colors: [Color(red: 12 / 255, green: 14 / 255, blue: 46 / 255).opacity(0.86),
                                      Color(red: 14 / 255, green: 14 / 255, blue: 50 / 255).opacity(0.82)]),
                    startPoint: .zero, endPoint: CGPoint(x: 0, y: h)
                ))
                planet(w * 0.62, h * 0.38, unit * 0.9, [(92, 96, 230, 0.22, 0)])
                planet(w * 0.82, h * 0.88, unit * 0.24, [(90, 70, 170, 0.4, 0)])
                planet(w, h * 0.06, unit * 0.62, [(84, 78, 170, 0.45, 0), (44, 44, 120, 0.25, 0.8), (140, 130, 255, 0.3, 0.97)])
                planet(w * 0.03, h * 1.04, unit * 0.75, [(122, 104, 214, 0.55, 0), (70, 60, 160, 0.35, 0.75), (170, 150, 255, 0.4, 0.97)])
            } else {
                canvas.fill(all, with: .linearGradient(
                    Gradient(colors: [Color(red: 250 / 255, green: 245 / 255, blue: 240 / 255).opacity(0.8),
                                      Color(red: 248 / 255, green: 241 / 255, blue: 238 / 255).opacity(0.82)]),
                    startPoint: .zero, endPoint: CGPoint(x: 0, y: h)
                ))
                planet(w * 0.7, h * 0.3, unit * 0.9, [(255, 244, 236, 0.8, 0)])
                planet(w * 1.04, h * 0.04, unit * 0.7, [(236, 226, 250, 0.75, 0), (250, 238, 228, 0.4, 0.85)])
                planet(w * -0.04, h * 1.04, unit * 0.95, [(244, 220, 206, 0.9, 0), (232, 214, 236, 0.55, 0.8), (255, 255, 255, 0.7, 0.97)])
                planet(w * 0.61, h * 0.36, unit * 0.46, [(255, 255, 255, 0.5, 0), (250, 228, 214, 0.45, 0.7), (255, 255, 255, 0.65, 0.96)])
            }
        }
    }
}

extension View {
    /// The ASTER atmosphere behind a whole screen, under the safe areas too.
    func asterBackground() -> some View {
        background(AsterBackdrop().ignoresSafeArea())
    }
}

/// The ASTER star: four soft points in the brand's blue-violet.
struct AsterMark: View {
    var size: CGFloat = 16

    var body: some View {
        AsterStar()
            .fill(LinearGradient(
                stops: [
                    .init(color: Color(red: 158 / 255, green: 197 / 255, blue: 1), location: 0),
                    .init(color: Color(red: 123 / 255, green: 140 / 255, blue: 246 / 255), location: 0.55),
                    .init(color: Color(red: 161 / 255, green: 123 / 255, blue: 244 / 255), location: 1),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

private struct AsterStar: Shape {
    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 32
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
        var path = Path()
        path.move(to: p(16, 1.5))
        path.addCurve(to: p(30.5, 16), control1: p(17.1, 9.1), control2: p(22.9, 14.9))
        path.addCurve(to: p(16, 30.5), control1: p(22.9, 17.1), control2: p(17.1, 22.9))
        path.addCurve(to: p(1.5, 16), control1: p(14.9, 22.9), control2: p(9.1, 17.1))
        path.addCurve(to: p(16, 1.5), control1: p(9.1, 14.9), control2: p(14.9, 9.1))
        path.closeSubpath()
        return path
    }
}

/// The four moods the hero companion moves in, as on the desktop.
enum AsterMood: String {
    case idle, listening, thinking, responding

    /// `companionMood` in `src/lib/aster-companion.ts`.
    static func of(busy: Bool, typing: Bool, streaming: Bool) -> AsterMood {
        if busy { return streaming ? .responding : .thinking }
        return typing ? .listening : .idle
    }

    var status: LocalizedStringKey {
        switch self {
        case .idle: "Here with you"
        case .listening: "Listening…"
        case .thinking: "Thinking…"
        case .responding: "Responding…"
        }
    }

    /// Seconds per float, seconds per morph, and the halo's strength.
    fileprivate var timing: (float: Double, morph: Double, halo: Double) {
        switch self {
        case .idle: (6, 9, 0.55)
        case .listening: (3.6, 6, 0.8)
        case .thinking: (4.5, 3.2, 0.7)
        case .responding: (2.8, 4, 0.95)
        }
    }
}

/// `greetingFor` in `src/lib/aster-companion.ts`.
func asterGreeting(hour: Int) -> String {
    switch hour {
    case 5..<12: "morning"
    case 12..<17: "afternoon"
    default: "evening"
    }
}

/// The ASTER companion — `AsterMascot.tsx`: a soft glass body that floats,
/// breathes and deforms, ringed by an orbit with two small moons. `size` is
/// the desktop's `--mascot-size`; the drawing is 1.3 × as wide as it is
/// tall. Reduce Motion holds it still.
struct AsterMascot: View {
    let mood: AsterMood
    var size: CGFloat = 190

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            Canvas { canvas, canvasSize in
                draw(in: &canvas, size: canvasSize, at: reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate)
            }
        }
        .frame(width: size * 1.3, height: size)
        .accessibilityElement()
        .accessibilityLabel(Text("ASTER companion, \(mood.rawValue)"))
    }

    private func draw(in canvas: inout GraphicsContext, size box: CGSize, at t: TimeInterval) {
        let s = box.height
        let unit = s / 300
        let c = CGPoint(x: box.width / 2, y: box.height / 2)
        let timing = mood.timing
        let dark = colorScheme == .dark

        // Ease-in-out back and forth: 0 → 1 → 0 over two periods.
        func swing(_ period: Double) -> CGFloat {
            CGFloat(0.5 - 0.5 * cos(t / period * .pi))
        }
        let float = reduceMotion ? 0.5 : swing(timing.float)
        let morph = reduceMotion ? 0 : CGFloat(t.truncatingRemainder(dividingBy: timing.morph) / timing.morph)
        let halo = reduceMotion ? 1 : 0.94 + 0.12 * swing(5)
        let blinkPhase = t.truncatingRemainder(dividingBy: 6) / 6
        let blink: CGFloat = reduceMotion || blinkPhase < 0.92 || blinkPhase > 0.98
            ? 1 : CGFloat(max(0.1, abs(blinkPhase - 0.95) / 0.03))

        // The halo.
        let haloRect = CGRect(x: c.x - s * 0.6 * halo, y: c.y - s * 0.42 * halo, width: s * 1.2 * halo, height: s * 0.84 * halo)
        canvas.fill(
            Path(ellipseIn: haloRect),
            with: .radialGradient(
                Gradient(colors: [Color(red: 150 / 255, green: 140 / 255, blue: 1).opacity(0.55 * timing.halo), .clear]),
                center: c, startRadius: 0, endRadius: s * 0.46
            )
        )

        // The orbit, in two halves so the body passes through it.
        let orbitRect = CGRect(x: c.x - s * 0.59, y: c.y + s * 0.02 - s * 0.21, width: s * 1.18, height: s * 0.42)
        func orbit(front: Bool, opacity: Double) {
            var ctx = canvas
            ctx.translateBy(x: c.x, y: c.y)
            ctx.rotate(by: .degrees(-16))
            ctx.translateBy(x: -c.x, y: -c.y)
            let split = orbitRect.midY
            ctx.clip(to: Path(front
                ? CGRect(x: -box.width, y: split, width: box.width * 3, height: box.height * 2)
                : CGRect(x: -box.width, y: split - box.height * 2, width: box.width * 3, height: box.height * 2)))
            let ring = Path(ellipseIn: orbitRect)
            ctx.stroke(ring, with: .color(Color(red: 180 / 255, green: 170 / 255, blue: 1).opacity(0.35 * opacity)), lineWidth: 5 * unit)
            ctx.stroke(ring, with: .color(Color.white.opacity(0.7 * opacity)), lineWidth: max(1, 1.5 * unit))
        }
        orbit(front: false, opacity: 0.6)

        // The body: floats, tilts, deforms.
        var body = canvas
        body.translateBy(x: 0, y: (6 - 16 * float) * unit)
        body.translateBy(x: c.x, y: c.y)
        body.rotate(by: .degrees(Double(-2 + 4 * float)))
        body.translateBy(x: -c.x, y: -c.y)
        let bw = s * 0.74, bh = s * 0.5
        let rect = CGRect(x: c.x - bw / 2, y: c.y - bh / 2, width: bw, height: bh)
        let blob = Self.blob(in: rect, phase: morph)
        body.fill(blob, with: .color(Color(red: 0.3, green: 0.3, blue: 0.78).opacity(0.3)))
        body.clip(to: blob)
        let core: [Color] = dark
            ? [Color(red: 196 / 255, green: 196 / 255, blue: 1).opacity(0.65),
               Color(red: 128 / 255, green: 132 / 255, blue: 236 / 255).opacity(0.75),
               Color(red: 92 / 255, green: 96 / 255, blue: 210 / 255).opacity(0.85)]
            : [Color(red: 232 / 255, green: 232 / 255, blue: 1).opacity(0.55),
               Color(red: 176 / 255, green: 180 / 255, blue: 244 / 255).opacity(0.6),
               Color(red: 128 / 255, green: 134 / 255, blue: 226 / 255).opacity(0.7)]
        body.fill(Path(rect), with: .radialGradient(
            Gradient(stops: [.init(color: core[0], location: 0), .init(color: core[1], location: 0.55), .init(color: core[2], location: 0.85)]),
            center: CGPoint(x: rect.minX + bw * 0.5, y: rect.minY + bh * 0.45), startRadius: 0, endRadius: bw * 0.6
        ))
        body.fill(Path(rect), with: .radialGradient(
            Gradient(colors: [Color(red: 1, green: 190 / 255, blue: 230 / 255).opacity(0.55), .clear]),
            center: CGPoint(x: rect.minX + bw * 0.7, y: rect.minY + bh * 0.85), startRadius: 0, endRadius: bw * 0.32
        ))
        body.fill(Path(rect), with: .linearGradient(
            Gradient(stops: [
                .init(color: .white.opacity(dark ? 0.45 : 0.6), location: 0),
                .init(color: .clear, location: 0.25),
                .init(color: .clear, location: 0.75),
                .init(color: Color(red: 70 / 255, green: 60 / 255, blue: 180 / 255).opacity(dark ? 0.45 : 0.3), location: 1),
            ]),
            startPoint: CGPoint(x: rect.midX, y: rect.minY), endPoint: CGPoint(x: rect.midX, y: rect.maxY)
        ))
        body.fill(Path(rect), with: .radialGradient(
            Gradient(colors: [.white.opacity(0.95), .clear]),
            center: CGPoint(x: rect.minX + bw * 0.3, y: rect.minY + bh * 0.24), startRadius: 0, endRadius: bw * 0.18
        ))
        // The sheen.
        let sheen = CGRect(x: rect.minX + bw * 0.12, y: rect.minY + bh * 0.08, width: bw * 0.46, height: bh * 0.3)
        body.fill(Path(ellipseIn: sheen), with: .linearGradient(
            Gradient(colors: [.white.opacity(0.75), .clear]),
            startPoint: CGPoint(x: sheen.midX, y: sheen.minY), endPoint: CGPoint(x: sheen.midX, y: sheen.maxY)
        ))
        // The face and its eyes.
        let face = CGRect(x: rect.minX + bw * 0.24, y: rect.minY + bh * 0.22, width: bw * 0.52, height: bh * 0.4)
        body.fill(Path(ellipseIn: face), with: .radialGradient(
            Gradient(stops: [
                .init(color: Color(red: 40 / 255, green: 44 / 255, blue: 130 / 255).opacity(0.85), location: 0),
                .init(color: Color(red: 60 / 255, green: 64 / 255, blue: 170 / 255).opacity(0.4), location: 0.7),
                .init(color: .clear, location: 1),
            ]),
            center: CGPoint(x: face.midX, y: face.minY + face.height * 0.45), startRadius: 0, endRadius: face.width * 0.55
        ))
        let eyeW = face.width * 0.12, eyeH = face.height * 0.22 * blink
        for at in [0.30, 0.58] {
            let eyeCenter = CGPoint(x: face.minX + face.width * at + eyeW / 2, y: face.minY + face.height * 0.36 + face.height * 0.11)
            body.fill(
                Path(ellipseIn: CGRect(x: eyeCenter.x - eyeW * 1.6, y: eyeCenter.y - eyeW * 1.6, width: eyeW * 3.2, height: eyeW * 3.2)),
                with: .radialGradient(Gradient(colors: [Color(red: 200 / 255, green: 210 / 255, blue: 1).opacity(0.9), .clear]),
                                      center: eyeCenter, startRadius: 0, endRadius: eyeW * 1.6)
            )
            body.fill(
                Path(ellipseIn: CGRect(x: eyeCenter.x - eyeW / 2, y: eyeCenter.y - eyeH / 2, width: eyeW, height: eyeH)),
                with: .color(.white)
            )
        }

        orbit(front: true, opacity: 1)

        // Two moons, drifting against the body.
        let drift = (-10 + 16 * float) * unit
        func moon(_ center: CGPoint, _ d: CGFloat) {
            canvas.fill(
                Path(ellipseIn: CGRect(x: center.x - d / 2, y: center.y - d / 2, width: d, height: d)),
                with: .radialGradient(
                    Gradient(stops: [
                        .init(color: Color(red: 244 / 255, green: 246 / 255, blue: 1), location: 0),
                        .init(color: Color(red: 169 / 255, green: 180 / 255, blue: 244 / 255), location: 0.45),
                        .init(color: Color(red: 102 / 255, green: 112 / 255, blue: 212 / 255), location: 1),
                    ]),
                    center: CGPoint(x: center.x - d * 0.15, y: center.y - d * 0.2), startRadius: 0, endRadius: d * 0.6
                )
            )
        }
        moon(CGPoint(x: box.width * 0.04 + s * 0.075, y: box.height * 0.18 + s * 0.075 + drift), s * 0.15)
        moon(CGPoint(x: box.width * 0.94 - s * 0.04, y: box.height * 0.9 - s * 0.04 + drift), s * 0.08)
    }

    /// A soft, slowly deforming blob — the desktop's border-radius morph.
    private static func blob(in rect: CGRect, phase: CGFloat) -> Path {
        let turn = phase * 2 * .pi
        var path = Path()
        let steps = 64
        for i in 0...steps {
            let a = CGFloat(i) / CGFloat(steps) * 2 * .pi
            let wobble = 1 + 0.07 * sin(2 * a + turn) + 0.04 * sin(3 * a - turn) + 0.03 * cos(a + 2 * turn)
            let point = CGPoint(x: rect.midX + cos(a) * rect.width / 2 * wobble,
                                y: rect.midY + sin(a) * rect.height / 2 * wobble)
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}

/// The home of an empty conversation — `MascotCentrepiece` on the desktop:
/// the companion, a greeting, a headline, who is here, and how they are.
/// Presentation only; it reads nothing it is not handed.
struct AsterHero: View {
    let name: String
    let mood: AsterMood
    var hour: Int = Calendar.current.component(.hour, from: Date())

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    var body: some View {
        // Landscape on a phone: the companion beside the words, smaller.
        if verticalSizeClass == .compact {
            HStack(spacing: 20) {
                AsterMascot(mood: mood, size: 120)
                words(centered: false)
            }
            .padding(.horizontal, 24)
        } else {
            VStack(spacing: 4) {
                AsterMascot(mood: mood, size: 170)
                words(centered: true)
            }
            .padding(.horizontal, 24)
        }
    }

    private func words(centered: Bool) -> some View {
        let palette = AsterPalette.of(colorScheme)
        return VStack(alignment: centered ? .center : .leading, spacing: 10) {
            Text("GOOD \(asterGreeting(hour: hour).uppercased()),")
                .font(.system(size: 12, weight: .medium))
                .tracking(1)
                .foregroundStyle(Color.secondary)
            Text("Let’s create something amazing \(Text("today.").foregroundColor(palette.violet))")
                .font(.system(size: 28, weight: .light))
                .tracking(-0.4)
                .foregroundStyle(Color.primary)
            Text("I’m \(name) — your AI companion. Ask me anything, plan, build, or just have a chat.")
                .font(.system(size: 14))
                .foregroundStyle(Color.secondary)
            HStack(spacing: 8) {
                Circle()
                    .fill(mood == .idle ? Color.green : palette.violet)
                    .frame(width: 6, height: 6)
                Text(mood.status)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .glassCapsule(interactive: false)
        }
        .multilineTextAlignment(centered ? .center : .leading)
        .frame(maxWidth: 420)
    }
}
