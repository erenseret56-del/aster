package com.openmausbot.companion.ui

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.graphics.luminance
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openmausbot.companion.R
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * The ASTER look, ported from the desktop's `--aster-*` tokens and `.aster-*`
 * surfaces in `src/styles.css`.
 *
 * The desktop paints it over its two default skins only — Midnight for dark,
 * Daylight for light — and every other skin keeps its own ground and accent.
 * The port keeps that rule: [AppearanceSkin.asterLook] is null for the other
 * six, and every surface that reads [LocalAsterLook] falls back to exactly
 * what it drew before.
 *
 * Android has no backdrop blur below API 31 (see `Chrome.kt`), so the
 * desktop's 36 % frosted fill would leave text over a scrolling list
 * unreadable. The fills here are the desktop's tints at a much higher
 * opacity: the same colour, rim and highlight, legible without the blur.
 */
@Immutable
data class AsterLook(
    val isDark: Boolean,
    /** The ground the atmosphere is laid on, and what scrims fade from. */
    val ground: Color,
    val violet: Color,
    val blue: Color,
    val glassFill: Color,
    val glassBorder: Color,
    val glassHighlight: Color,
    val glassShadow: Color,
    val chipFill: Color,
) {
    /** `.aster-send` and `.aster-gradient-text`: violet into blue. */
    val accentBrush: Brush get() = Brush.linearGradient(listOf(violet, blue))

    companion object {
        val Midnight = AsterLook(
            isDark = true,
            ground = Color(0xFF0B0D2A),
            violet = Color(0xFFA99BFF),
            blue = Color(0xFF8B9BFF),
            glassFill = Color(0xFF22245A).copy(alpha = 0.90f),
            glassBorder = Color(0xFFAAB0FF).copy(alpha = 0.18f),
            glassHighlight = Color.White.copy(alpha = 0.10f),
            glassShadow = Color(0xFF040418),
            chipFill = Color(0xFF282A60).copy(alpha = 0.70f),
        )
        val Daylight = AsterLook(
            isDark = false,
            ground = Color(0xFFF6F1EC),
            violet = Color(0xFF8B7CF6),
            blue = Color(0xFF7AA7FF),
            glassFill = Color.White.copy(alpha = 0.86f),
            glassBorder = Color.White.copy(alpha = 0.90f),
            glassHighlight = Color.White,
            glassShadow = Color(0xFF4C488C),
            chipFill = Color.White.copy(alpha = 0.72f),
        )
    }
}

/** The desktop draws the ASTER home over Midnight and Daylight only. */
fun AppearanceSkin.asterLook(): AsterLook? = when (this) {
    AppearanceSkin.MIDNIGHT -> AsterLook.Midnight
    AppearanceSkin.DAYLIGHT -> AsterLook.Daylight
    else -> null
}

/** Null under every skin the ASTER look does not cover. */
val LocalAsterLook = staticCompositionLocalOf<AsterLook?> { null }

/**
 * `.glass-ground` on the ASTER skins: the ground, the desktop's wallpaper
 * under a wash, and soft planets rising from the edges. Drawn once per size;
 * nothing here animates.
 */
@Composable
fun AsterBackdrop(look: AsterLook, modifier: Modifier = Modifier) {
    Box(modifier = modifier.background(look.ground)) {
        Image(
            painter = painterResource(if (look.isDark) R.drawable.aster_wallpaper_dark else R.drawable.aster_wallpaper_light),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.matchParentSize(),
        )
        Box(
            modifier = Modifier.matchParentSize().drawWithCache {
                val w = size.width
                val h = size.height
                val unit = minOf(w, h)
                fun planet(center: Offset, radius: Float, vararg stops: Pair<Float, Color>) =
                    Brush.radialGradient(*stops, center = center, radius = radius)
                // The wash that pulls the wallpaper toward the palette, then
                // the planets, bottom layer first as the CSS lists them last.
                val layers = if (look.isDark) {
                    listOf(
                        Brush.verticalGradient(listOf(Color(0xDB0C0E2E), Color(0xD10E0E32))),
                        planet(Offset(w * 0.62f, h * 0.38f), unit * 0.9f,
                            0f to Color(0x385C60E6), 1f to Color.Transparent),
                        planet(Offset(w * 0.82f, h * 0.88f), unit * 0.24f,
                            0f to Color(0x665A46AA), 1f to Color.Transparent),
                        planet(Offset(w * 1.0f, h * 0.06f), unit * 0.62f,
                            0f to Color(0x73544EAA), 0.8f to Color(0x402C2C78), 0.97f to Color(0x4D8C82FF), 1f to Color.Transparent),
                        planet(Offset(w * 0.03f, h * 1.04f), unit * 0.75f,
                            0f to Color(0x8C7A68D6), 0.75f to Color(0x59463CA0), 0.97f to Color(0x66AA96FF), 1f to Color.Transparent),
                    )
                } else {
                    listOf(
                        Brush.verticalGradient(listOf(Color(0xCCFAF5F0), Color(0xD1F8F1EE))),
                        planet(Offset(w * 0.7f, h * 0.3f), unit * 0.9f,
                            0f to Color(0xCCFFF4EC), 1f to Color.Transparent),
                        planet(Offset(w * 1.04f, h * 0.04f), unit * 0.7f,
                            0f to Color(0xBFECE2FA), 0.85f to Color(0x66FAEEE4), 1f to Color.Transparent),
                        planet(Offset(w * -0.04f, h * 1.04f), unit * 0.95f,
                            0f to Color(0xE6F4DCCE), 0.8f to Color(0x8CE8D6EC), 0.97f to Color(0xB3FFFFFF), 1f to Color.Transparent),
                        planet(Offset(w * 0.61f, h * 0.36f), unit * 0.46f,
                            0f to Color(0x80FFFFFF), 0.7f to Color(0x73FAE4D6), 0.96f to Color(0xA6FFFFFF), 1f to Color.Transparent),
                    )
                }
                onDrawBehind { layers.forEach { drawRect(it) } }
            },
        )
    }
}

/**
 * A frosted ASTER surface — `.aster-card`: tinted fill, hairline rim, a top
 * highlight, and a shadow tinted toward the palette.
 */
internal fun Modifier.asterGlass(look: AsterLook, shape: Shape, elevation: Dp): Modifier = this
    .shadow(
        elevation = elevation * 2,
        shape = shape,
        clip = false,
        ambientColor = look.glassShadow,
        spotColor = look.glassShadow,
    )
    .background(look.glassFill, shape)
    .background(
        Brush.verticalGradient(0f to look.glassHighlight.copy(alpha = look.glassHighlight.alpha * 0.35f), 0.5f to Color.Transparent),
        shape,
    )
    .border(1.dp, look.glassBorder, shape)

/** The four moods the hero companion moves in, as on the desktop. */
enum class AsterMood { IDLE, LISTENING, THINKING, RESPONDING }

/** `companionMood` in `src/lib/aster-companion.ts`. */
fun asterMood(busy: Boolean, typing: Boolean, streaming: Boolean): AsterMood = when {
    busy -> if (streaming) AsterMood.RESPONDING else AsterMood.THINKING
    typing -> AsterMood.LISTENING
    else -> AsterMood.IDLE
}

/** `greetingFor` in `src/lib/aster-companion.ts`. */
fun asterGreeting(hour: Int): String = when (hour) {
    in 5..11 -> "morning"
    in 12..16 -> "afternoon"
    else -> "evening"
}

fun asterStatusLabel(mood: AsterMood): String = when (mood) {
    AsterMood.IDLE -> "Here with you"
    AsterMood.LISTENING -> "Listening…"
    AsterMood.THINKING -> "Thinking…"
    AsterMood.RESPONDING -> "Responding…"
}

/** The ASTER star: four soft points in the brand's blue-violet. */
@Composable
fun AsterMark(size: Dp, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.size(size)) {
        val k = this.size.minDimension / 32f
        val star = Path().apply {
            moveTo(16f * k, 1.5f * k)
            cubicTo(17.1f * k, 9.1f * k, 22.9f * k, 14.9f * k, 30.5f * k, 16f * k)
            cubicTo(22.9f * k, 17.1f * k, 17.1f * k, 22.9f * k, 16f * k, 30.5f * k)
            cubicTo(14.9f * k, 22.9f * k, 9.1f * k, 17.1f * k, 1.5f * k, 16f * k)
            cubicTo(9.1f * k, 14.9f * k, 14.9f * k, 9.1f * k, 16f * k, 1.5f * k)
            close()
        }
        drawPath(
            star,
            Brush.linearGradient(
                0f to Color(0xFF9EC5FF),
                0.55f to Color(0xFF7B8CF6),
                1f to Color(0xFFA17BF4),
                start = Offset(4f * k, 4f * k),
                end = Offset(28f * k, 28f * k),
            ),
        )
    }
}

private data class MoodTiming(val floatMs: Int, val morphMs: Int, val halo: Float)

private fun AsterMood.timing() = when (this) {
    AsterMood.IDLE -> MoodTiming(6000, 9000, 0.55f)
    AsterMood.LISTENING -> MoodTiming(3600, 6000, 0.8f)
    AsterMood.THINKING -> MoodTiming(4500, 3200, 0.7f)
    AsterMood.RESPONDING -> MoodTiming(2800, 4000, 0.95f)
}

/**
 * The ASTER companion — `AsterMascot.tsx`: a soft glass body that floats,
 * breathes and deforms, ringed by an orbit with two small moons. [size] is
 * the desktop's `--mascot-size`; the drawing is 1.3 × as wide as it is tall.
 * With animations switched off in the system, it holds still.
 */
@Composable
fun AsterMascot(mood: AsterMood, size: Dp, modifier: Modifier = Modifier) {
    val look = LocalAsterLook.current ?: AsterLook.Midnight
    val context = LocalContext.current
    val still = remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val timing = mood.timing()
    val floatPhase: Float
    val morphPhase: Float
    val haloScale: Float
    val blink: Float
    if (still) {
        floatPhase = 0.5f
        morphPhase = 0f
        haloScale = 1f
        blink = 1f
    } else {
        val transition = rememberInfiniteTransition(label = "aster-mascot")
        val f by transition.animateFloat(
            0f, 1f,
            infiniteRepeatable(tween(timing.floatMs, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "float",
        )
        val m by transition.animateFloat(
            0f, 1f,
            infiniteRepeatable(tween(timing.morphMs, easing = LinearEasing)),
            label = "morph",
        )
        val h by transition.animateFloat(
            0.94f, 1.06f,
            infiniteRepeatable(tween(5000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "halo",
        )
        val b by transition.animateFloat(
            1f, 1f,
            infiniteRepeatable(
                keyframes {
                    durationMillis = 6000
                    1f at 5520
                    0.1f at 5700
                    1f at 5880
                },
            ),
            label = "blink",
        )
        floatPhase = f
        morphPhase = m
        haloScale = h
        blink = b
    }

    Canvas(
        modifier = modifier
            .size(width = size * 1.3f, height = size)
            .semantics { contentDescription = "ASTER companion, ${mood.name.lowercase()}" },
    ) {
        drawAsterMascot(look, this.size.height, timing.halo, floatPhase, morphPhase, haloScale, blink)
    }
}

private fun DrawScope.drawAsterMascot(
    look: AsterLook,
    s: Float,
    halo: Float,
    floatPhase: Float,
    morphPhase: Float,
    haloScale: Float,
    blink: Float,
) {
    val c = center
    val unit = s / 300f

    // The halo.
    scale(haloScale, c) {
        drawOval(
            Brush.radialGradient(
                listOf(Color(0xFF968CFF).copy(alpha = 0.55f * halo), Color.Transparent),
                center = c,
                radius = s * 0.46f,
            ),
            topLeft = Offset(c.x - s * 0.6f, c.y - s * 0.42f),
            size = Size(s * 1.2f, s * 0.84f),
        )
    }

    // The orbit, drawn in two halves so the body passes through it.
    val orbitSize = Size(s * 1.18f, s * 0.42f)
    val orbitCenter = Offset(c.x, c.y + s * 0.02f)
    fun orbitHalf(front: Boolean, alpha: Float) = rotate(-16f, orbitCenter) {
        val top = orbitCenter.y - orbitSize.height / 2
        val clip = if (front) {
            Rect(0f, orbitCenter.y - orbitSize.height * 0.02f, size.width * 2, size.height * 2)
        } else {
            Rect(-size.width, top - s, size.width * 2, orbitCenter.y + orbitSize.height * 0.02f)
        }
        clipRect(clip.left, clip.top, clip.right, clip.bottom) {
            drawOval(
                Color(0xFFB4AAFF).copy(alpha = 0.35f * alpha),
                topLeft = Offset(orbitCenter.x - orbitSize.width / 2, top),
                size = orbitSize,
                style = Stroke(width = 5f * unit),
            )
            drawOval(
                Color.White.copy(alpha = 0.7f * alpha),
                topLeft = Offset(orbitCenter.x - orbitSize.width / 2, top),
                size = orbitSize,
                style = Stroke(width = 1.5f * unit.coerceAtLeast(0.6f)),
            )
        }
    }
    orbitHalf(front = false, alpha = 0.6f)

    // The body: floats, tilts, and deforms.
    val lift = (6f - 16f * floatPhase) * unit
    val tilt = -2f + 4f * floatPhase
    val bodyW = s * 0.74f
    val bodyH = s * 0.5f
    translate(top = lift) {
        rotate(tilt, c) {
            val blob = blobPath(c, bodyW / 2, bodyH / 2, morphPhase)
            val left = c.x - bodyW / 2
            val top = c.y - bodyH / 2
            drawPath(
                blob,
                Color(if (look.isDark) 0xFF4646BE else 0xFF6E6EC8).copy(alpha = 0.35f),
            )
            clipPath(blob) {
                val core = if (look.isDark) {
                    listOf(Color(0xA6C4C4FF), Color(0xBF8084EC), Color(0xD95C60D2))
                } else {
                    listOf(Color(0x8CE8E8FF), Color(0x99B0B4F4), Color(0xB38086E2))
                }
                drawRect(
                    Brush.radialGradient(
                        0f to core[0], 0.55f to core[1], 0.85f to core[2], 1f to core[2],
                        center = Offset(left + bodyW * 0.5f, top + bodyH * 0.45f),
                        radius = bodyW * 0.6f,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        listOf(Color(0x8CFFBEE6), Color.Transparent),
                        center = Offset(left + bodyW * 0.7f, top + bodyH * 0.85f),
                        radius = bodyW * 0.32f,
                    ),
                )
                // The inset shade along the bottom and light along the top.
                drawRect(
                    Brush.verticalGradient(
                        0f to Color.White.copy(alpha = if (look.isDark) 0.45f else 0.6f),
                        0.25f to Color.Transparent,
                        0.75f to Color.Transparent,
                        1f to Color(0xFF463CB4).copy(alpha = if (look.isDark) 0.45f else 0.3f),
                        startY = top,
                        endY = top + bodyH,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        listOf(Color.White.copy(alpha = 0.95f), Color.Transparent),
                        center = Offset(left + bodyW * 0.3f, top + bodyH * 0.24f),
                        radius = bodyW * 0.18f,
                    ),
                )
                // The sheen.
                drawOval(
                    Brush.verticalGradient(
                        listOf(Color.White.copy(alpha = 0.75f), Color.Transparent),
                        startY = top + bodyH * 0.08f,
                        endY = top + bodyH * 0.38f,
                    ),
                    topLeft = Offset(left + bodyW * 0.12f, top + bodyH * 0.08f),
                    size = Size(bodyW * 0.46f, bodyH * 0.3f),
                )
                // The face and its eyes.
                val faceTopLeft = Offset(left + bodyW * 0.24f, top + bodyH * 0.22f)
                val faceSize = Size(bodyW * 0.52f, bodyH * 0.4f)
                drawOval(
                    Brush.radialGradient(
                        0f to Color(0xD9282C82), 0.7f to Color(0x663C40AA), 1f to Color.Transparent,
                        center = Offset(faceTopLeft.x + faceSize.width * 0.5f, faceTopLeft.y + faceSize.height * 0.45f),
                        radius = faceSize.width * 0.55f,
                    ),
                    topLeft = faceTopLeft,
                    size = faceSize,
                )
                val eyeW = faceSize.width * 0.12f
                val eyeH = faceSize.height * 0.22f
                val eyeTop = faceTopLeft.y + faceSize.height * 0.36f
                listOf(0.30f, 0.58f).forEach { at ->
                    val eye = Offset(faceTopLeft.x + faceSize.width * at, eyeTop)
                    val eyeCenter = Offset(eye.x + eyeW / 2, eye.y + eyeH / 2)
                    drawCircle(
                        Brush.radialGradient(listOf(Color(0xE6C8D2FF), Color.Transparent), eyeCenter, eyeW * 1.6f),
                        radius = eyeW * 1.6f,
                        center = eyeCenter,
                    )
                    scale(1f, blink, eyeCenter) {
                        drawOval(Color.White, topLeft = eye, size = Size(eyeW, eyeH))
                    }
                }
            }
        }
    }

    orbitHalf(front = true, alpha = 1f)

    // Two moons, drifting against the body.
    val drift = (-10f + 16f * floatPhase) * unit
    fun moon(center: Offset, d: Float) {
        drawCircle(
            Brush.radialGradient(
                0f to Color(0xFFF4F6FF), 0.45f to Color(0xFFA9B4F4), 1f to Color(0xFF6670D4),
                center = Offset(center.x - d * 0.15f, center.y - d * 0.2f),
                radius = d * 0.6f,
            ),
            radius = d / 2,
            center = center,
        )
    }
    val width = size.width
    val height = size.height
    moon(Offset(width * 0.04f + s * 0.075f, height * 0.18f + s * 0.075f + drift), s * 0.15f)
    moon(Offset(width * 0.94f - s * 0.04f, height * 0.90f - s * 0.04f + drift), s * 0.08f)
}

/** A soft, slowly deforming blob — the desktop's border-radius morph. */
private fun blobPath(c: Offset, rx: Float, ry: Float, phase: Float): Path {
    val turn = phase * 2f * PI.toFloat()
    val path = Path()
    val steps = 64
    for (i in 0..steps) {
        val a = i / steps.toFloat() * 2f * PI.toFloat()
        val wobble = 1f + 0.07f * sin(2f * a + turn) + 0.04f * sin(3f * a - turn) + 0.03f * cos(a + 2f * turn)
        val x = c.x + cos(a) * rx * wobble
        val y = c.y + sin(a) * ry * wobble
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    return path
}

/**
 * The home of an empty conversation — `MascotCentrepiece` on the desktop: the
 * companion, a greeting, a headline, who is here, and how they are. Purely
 * presentation; it is drawn only while the transcript is empty and reads
 * nothing it is not handed.
 *
 * Drawn under every skin, as the desktop draws its hero: the skins the ASTER
 * look does not cover borrow Midnight or Daylight for the companion's glass.
 * It scrolls itself, inside its measured box, so the box keeps a finite height
 * to centre the companion in and to tell a landscape phone apart.
 */
@Composable
fun AsterHero(
    name: String,
    mood: AsterMood,
    hour: Int,
    modifier: Modifier = Modifier,
) {
    val look = LocalAsterLook.current ?: asterLookFor(MaterialTheme.colorScheme.surface)
    BoxWithConstraints(modifier = modifier.testTag("aster-hero")) {
        val layout = asterHeroLayout(maxWidth, maxHeight)
        val content = Modifier
            .verticalScroll(rememberScrollState())
            .fillMaxWidth()
            .heightIn(min = maxHeight)
            .padding(horizontal = 24.dp)
        if (layout.wide) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
                modifier = content,
            ) {
                AsterMascot(mood = mood, size = layout.mascot)
                AsterHeroWords(look, name, mood, hour, centered = false)
            }
        } else {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                modifier = content,
            ) {
                AsterMascot(mood = mood, size = layout.mascot)
                AsterHeroWords(look, name, mood, hour, centered = true)
            }
        }
    }
}

/** The ASTER look a skin without one borrows for the hero: by how dark it is. */
internal fun asterLookFor(surface: Color): AsterLook =
    if (surface.luminance() < 0.5f) AsterLook.Midnight else AsterLook.Daylight

/** How the hero lays out in the space it is given. */
internal data class AsterHeroLayout(val wide: Boolean, val mascot: Dp)

/**
 * Landscape on a phone puts the companion beside the words, smaller; upright,
 * it stands above them at most half the space, so the words still fit.
 */
internal fun asterHeroLayout(maxWidth: Dp, maxHeight: Dp): AsterHeroLayout {
    val wide = maxWidth > maxHeight && maxHeight < 480.dp
    val mascot = if (wide) {
        (maxHeight * 0.5f).coerceIn(90.dp, 160.dp)
    } else {
        minOf(maxWidth * 0.5f, maxHeight * 0.4f).coerceIn(120.dp, 220.dp)
    }
    return AsterHeroLayout(wide, mascot)
}

@Composable
private fun AsterHeroWords(look: AsterLook, name: String, mood: AsterMood, hour: Int, centered: Boolean) {
    val align = if (centered) TextAlign.Center else TextAlign.Start
    Column(
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.widthIn(max = 420.dp),
    ) {
        Text(
            text = "GOOD ${asterGreeting(hour).uppercase()},",
            fontSize = 12.sp,
            letterSpacing = 1.sp,
            fontWeight = FontWeight.Medium,
            color = secondaryTint,
            textAlign = align,
        )
        Text(
            text = buildAnnotatedString {
                append("Let’s create something amazing ")
                withStyle(SpanStyle(brush = look.accentBrush, fontWeight = FontWeight.Normal)) { append("today.") }
            },
            fontSize = 28.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Light,
            letterSpacing = (-0.4).sp,
            textAlign = align,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "I’m $name — your AI companion. Ask me anything, plan, build, or just have a chat.",
            fontSize = 14.sp,
            lineHeight = 20.sp,
            color = secondaryTint,
            textAlign = align,
        )
        Row(
            modifier = Modifier
                .asterGlass(look, CircleShape, 1.dp)
                .padding(horizontal = 12.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .background(
                        if (mood == AsterMood.IDLE) MaterialTheme.colorScheme.tertiary else look.violet,
                        CircleShape,
                    ),
            )
            Text(asterStatusLabel(mood), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = secondaryTint)
        }
    }
}
