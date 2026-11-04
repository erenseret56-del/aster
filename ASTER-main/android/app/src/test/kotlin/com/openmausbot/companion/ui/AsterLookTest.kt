package com.openmausbot.companion.ui

import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AsterLookTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `only Midnight and Daylight carry the ASTER look, as on the desktop`() {
        assertEquals(AsterLook.Midnight, AppearanceSkin.MIDNIGHT.asterLook())
        assertEquals(AsterLook.Daylight, AppearanceSkin.DAYLIGHT.asterLook())
        AppearanceSkin.entries
            .filter { it != AppearanceSkin.MIDNIGHT && it != AppearanceSkin.DAYLIGHT }
            .forEach { assertNull(it.asterLook(), it.name) }
    }

    @Test
    fun `the look follows the skin's appearance`() {
        assertEquals(AppearanceSkin.MIDNIGHT.isDark, AsterLook.Midnight.isDark)
        assertEquals(AppearanceSkin.DAYLIGHT.isDark, AsterLook.Daylight.isDark)
    }

    @Test
    fun `moods match companionMood on the desktop`() {
        assertEquals(AsterMood.IDLE, asterMood(busy = false, typing = false, streaming = false))
        assertEquals(AsterMood.LISTENING, asterMood(busy = false, typing = true, streaming = false))
        assertEquals(AsterMood.THINKING, asterMood(busy = true, typing = true, streaming = false))
        assertEquals(AsterMood.RESPONDING, asterMood(busy = true, typing = false, streaming = true))
        assertEquals(AsterMood.IDLE, asterMood(busy = false, typing = false, streaming = true))
    }

    @Test
    fun `greetings match greetingFor on the desktop`() {
        assertEquals("evening", asterGreeting(4))
        assertEquals("morning", asterGreeting(5))
        assertEquals("morning", asterGreeting(11))
        assertEquals("afternoon", asterGreeting(12))
        assertEquals("afternoon", asterGreeting(16))
        assertEquals("evening", asterGreeting(17))
    }

    @Test
    fun `the theme provides the look for an ASTER skin and none otherwise`() {
        var midnight: AsterLook? = null
        var lagoon: AsterLook? = AsterLook.Daylight
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) { midnight = LocalAsterLook.current }
            CompanionTheme(skin = AppearanceSkin.LAGOON) { lagoon = LocalAsterLook.current }
        }
        compose.waitForIdle()
        assertNotNull(midnight)
        assertNull(lagoon)
    }

    @Test
    fun `the hero greets with the bot's name and its status`() {
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.DAYLIGHT) {
                AsterHero(name = "Jev", mood = AsterMood.THINKING, hour = 9)
            }
        }
        compose.onNodeWithTag("aster-hero").assertIsDisplayed()
        compose.onNodeWithText("GOOD MORNING,").assertIsDisplayed()
        compose.onNodeWithText("Thinking…").assertIsDisplayed()
        compose.onNodeWithText("I’m Jev", substring = true).assertIsDisplayed()
    }

    @Test
    fun `the hero and its companion draw under every skin, as the desktop's do`() {
        // The phone once drew nothing here, so a reader on any skin but
        // Midnight or Daylight never saw the companion at all.
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.LAGOON) {
                AsterHero(name = "Jev", mood = AsterMood.IDLE, hour = 9)
            }
        }
        compose.onNodeWithTag("aster-hero").assertIsDisplayed()
        compose.onNodeWithContentDescription("ASTER companion, idle").assertIsDisplayed()
        compose.onNodeWithText("I’m Jev", substring = true).assertIsDisplayed()
    }

    @Test
    fun `the companion is drawn at a real size, centred in the space it is given`() {
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) {
                AsterHero(name = "Jev", mood = AsterMood.IDLE, hour = 9, modifier = Modifier.size(300.dp, 560.dp))
            }
        }
        val mascot = compose.onNodeWithContentDescription("ASTER companion, idle").getUnclippedBoundsInRoot()
        // half the width (150dp) is the tighter limit than 40 % of the height (224dp)
        assertEquals(150.dp, mascot.bottom - mascot.top)
        assertEquals(195.dp, mascot.right - mascot.left)
        // centred, not pinned under the header as when the box measured an infinite height
        assertTrue(mascot.top > 40.dp, "mascot top ${mascot.top}")
    }

    @Test
    fun `the hero lays out upright on a phone and beside the words in landscape`() {
        val upright = asterHeroLayout(maxWidth = 392.dp, maxHeight = 560.dp)
        assertFalse(upright.wide)
        assertEquals(196.dp, upright.mascot)
        val landscape = asterHeroLayout(maxWidth = 800.dp, maxHeight = 300.dp)
        assertTrue(landscape.wide)
        assertEquals(150.dp, landscape.mascot)
        // a tiny space still draws a companion that reads
        assertEquals(120.dp, asterHeroLayout(maxWidth = 200.dp, maxHeight = 200.dp).mascot)
    }

    @Test
    fun `a skin without the ASTER look borrows Midnight or Daylight by its darkness`() {
        assertEquals(AsterLook.Midnight, asterLookFor(Color(0xFF101418)))
        assertEquals(AsterLook.Daylight, asterLookFor(Color(0xFFF4F4F4)))
    }
}
