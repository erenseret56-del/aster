package com.openmausbot.companion.ui

import com.openmausbot.companion.core.ChatTarget
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

/** The bottom tab bar on the hand-rolled stack: places, Back, Home and restarts. */
class AsterTabNavigationTest {
    private val koda = Destination.Chat(ChatTarget.Bot("koda", "t-koda"))
    private val vega = Destination.Chat(ChatTarget.Bot("vega", "t-vega"))
    private val room = Destination.Chat(ChatTarget.Room("room", "t-room"))

    @Test
    fun `each tab is one place above the roster, so Back still lands on Chats`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.SETTINGS) { null }
        assertEquals(listOf(Destination.Roster, Destination.Settings), navigator.stack)
        navigator.showTab(AsterTab.APPS) { null }
        assertEquals(listOf(Destination.Roster, Destination.ConnectedApps), navigator.stack)
        navigator.showTab(AsterTab.ROUTINES) { null }
        assertEquals(listOf(Destination.Roster, Destination.Routines), navigator.stack)
        navigator.pop()
        assertEquals(listOf(Destination.Roster), navigator.stack)
        navigator.showTab(AsterTab.CHATS) { null }
        assertEquals(listOf(Destination.Roster), navigator.stack)
    }

    @Test
    fun `Home opens the last bot conversation, else the fallback, never a room`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, vega), navigator.stack)

        navigator.showTab(AsterTab.CHATS) { null }
        navigator.push(koda)
        navigator.push(room)
        navigator.showTab(AsterTab.SETTINGS) { null }
        navigator.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, koda), navigator.stack)
    }

    @Test
    fun `Home with no bot at all stays on the roster`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { null }
        assertEquals(listOf(Destination.Roster), navigator.stack)
        assertNull(navigator.lastBotChat)
    }

    @Test
    fun `a restored stack remembers its bot conversation for Home`() {
        val saved = CompanionNavigator.encodeWithBond(listOf(Destination.Roster, koda, Destination.Computer("koda")), 3)
        val restored = CompanionNavigator.restoreForGeneration(saved, 3)!!
        assertEquals(koda, restored.lastBotChat)
        restored.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, koda), restored.stack)
    }

    @Test
    fun `the bar shows on the four top-level screens and nowhere else`() {
        assertEquals(AsterTab.CHATS, Destination.Roster.asterTab())
        assertEquals(AsterTab.ROUTINES, Destination.Routines.asterTab())
        assertEquals(AsterTab.APPS, Destination.ConnectedApps.asterTab())
        assertEquals(AsterTab.SETTINGS, Destination.Settings.asterTab())
        assertNull(koda.asterTab())
        assertNull(Destination.Computer("koda").asterTab())
        assertNull(Destination.Overview("koda").asterTab())
        assertTrue(AsterTab.entries.map { it.label } == listOf("Home", "Chats", "Routines", "Apps", "Settings"))
    }

    @Test
    fun `a fresh launch opens on Home once the fleet names a bot`() {
        val navigator = CompanionNavigator(opensHome = true)
        // the fleet has not arrived: still on the roster, still waiting
        assertFalse(navigator.settleLaunchHome { null })
        assertEquals(listOf(Destination.Roster), navigator.stack)
        assertTrue(navigator.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster, vega), navigator.stack)
        assertEquals(vega, navigator.lastBotChat)
        // once only: Back to Chats stays on Chats
        navigator.pop()
        assertTrue(navigator.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), navigator.stack)
    }

    @Test
    fun `a notification tap or the reader's own choice wins over the launch Home`() {
        val tapped = CompanionNavigator(opensHome = true)
        tapped.openThread("t-room")
        assertTrue(tapped.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster, Destination.Thread("t-room")), tapped.stack)

        val chose = CompanionNavigator(opensHome = true)
        chose.showTab(AsterTab.CHATS) { null }
        assertTrue(chose.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), chose.stack)
    }

    @Test
    fun `a restored stack is never moved to Home`() {
        val saved = CompanionNavigator.encodeWithBond(listOf(Destination.Roster), 1)
        val restored = CompanionNavigator.restoreForGeneration(saved, 1)!!
        assertTrue(restored.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), restored.stack)
    }
}
