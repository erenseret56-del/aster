package com.openmausbot.companion.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner

/**
 * The palette and the silhouette are copied artwork. A copy that drifts is the
 * failure mode these guard against — a bot you know by its shape and colour must
 * look the same on the phone as it does on the laptop.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MausAvatarTest {

    @Test
    fun `every MAUS_COLORS entry maps to its desktop hex`() {
        assertEquals(0xFF009957.toInt(), MausPalette.argb("green"))
        assertEquals(0xFF377FE6.toInt(), MausPalette.argb("blue"))
        assertEquals(0xFFD94B52.toInt(), MausPalette.argb("red"))
        assertEquals(0xFFE78531.toInt(), MausPalette.argb("orange"))
        assertEquals(0xFF8057C8.toInt(), MausPalette.argb("purple"))
        assertEquals(0xFF0EA5C6.toInt(), MausPalette.argb("cyan"))
        assertEquals(0xFFD84F8B.toInt(), MausPalette.argb("pink"))
        assertEquals(0xFFD8A729.toInt(), MausPalette.argb("yellow"))
        assertEquals(0xFF01A492.toInt(), MausPalette.argb("teal"))
        assertEquals(0xFFE5634E.toInt(), MausPalette.argb("coral"))
        assertEquals(10, MausPalette.names.size)
    }

    @Test
    fun `an unknown colour falls back to grey rather than crashing`() {
        assertEquals(MausPalette.FALLBACK, MausPalette.argb("chartreuse"))
        assertEquals(MausPalette.FALLBACK, MausPalette.argb(""))
        assertEquals(0xFF8E8E93.toInt(), MausPalette.FALLBACK)
    }

    @Test
    fun `mix walks linearly between two colours in sRGB`() {
        val black = 0xFF000000.toInt()
        val white = 0xFFFFFFFF.toInt()
        assertEquals(black, MausPalette.mix(black, white, 0.0))
        assertEquals(white, MausPalette.mix(black, white, 1.0))
        assertEquals(0xFF7F7F7F.toInt(), MausPalette.mix(black, white, 0.5))
    }

    @Test
    fun `the gradient is the desktop's three stops around the base colour`() {
        val stops = MausPalette.gradient("green")
        assertEquals(listOf(0f, 0.55f, 1f), stops.map { it.first })
        assertEquals(MausPalette.argb("green"), stops[1].second)
        // lighter at the top, darker at the bottom
        fun luminance(argb: Int) =
            ((argb shr 16) and 0xFF) + ((argb shr 8) and 0xFF) + (argb and 0xFF)
        assertTrue(luminance(stops[0].second) > luminance(stops[1].second))
        assertTrue(luminance(stops[2].second) < luminance(stops[1].second))
    }

    @Test
    fun `every companion's face sits on its own body in the face box`() {
        // Which is what puts the visor and eyes on the body rather than beside it:
        // every face coordinate is expressed in this box.
        for (id in MausBodies.order) {
            val bounds = MausSilhouette.faceBoxBounds(id)
            assertTrue(bounds.width > 0f && bounds.height > 0f, "$id has no extent")
            val anchor = MausSilhouette.anchor(id)
            assertTrue(anchor.x in bounds.left..bounds.right, "$id face is beside its body")
            assertTrue(anchor.y in bounds.top..bounds.bottom, "$id face is beside its body")
        }
    }
}
