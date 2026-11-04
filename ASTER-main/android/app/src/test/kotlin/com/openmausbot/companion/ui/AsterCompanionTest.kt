package com.openmausbot.companion.ui

import com.openmausbot.companion.core.Message
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

/** The desktop's `isCompanionHome` cases (src/lib/aster-companion.test.ts), on the phone. */
class AsterCompanionTest {
    private fun said(role: Message.Role, text: String, kind: Message.Kind = Message.Kind.TEXT) =
        Message(id = "$role-$kind-$text", role = role, kind = kind, at = 0.0, text = text)

    private val greeting = said(Message.Role.BOT, "Hi, I'm Koda. What would you like me to do?")

    @Test
    fun `an empty thread and a new bot's seeded greeting are the home`() {
        assertTrue(AsterCompanion.isHome(busy = false, messages = emptyList()))
        assertTrue(AsterCompanion.isHome(busy = false, messages = listOf(greeting)))
        // a renamed bot keeps the greeting it was created with
        assertTrue(AsterCompanion.isHome(busy = false, messages = listOf(said(Message.Role.BOT, "Hi, I'm Old Name. What would you like me to do?"))))
    }

    @Test
    fun `anything else said makes it a conversation`() {
        assertFalse(AsterCompanion.isHome(busy = false, messages = listOf(greeting, said(Message.Role.USER, "hello"))))
        // bot content with no user turn: a routine result, a peer's or a webhook's message
        assertFalse(AsterCompanion.isHome(busy = false, messages = listOf(said(Message.Role.BOT, "Daily report: 3 issues closed."))))
        assertFalse(AsterCompanion.isHome(busy = false, messages = listOf(greeting, said(Message.Role.BOT, "", Message.Kind.ROUTINE_RUN))))
        // a user who types the greeting's words is still a person talking
        assertFalse(AsterCompanion.isHome(busy = false, messages = listOf(said(Message.Role.USER, "Hi, I'm Koda. What would you like me to do?"))))
    }

    @Test
    fun `never home while the bot is working`() {
        assertFalse(AsterCompanion.isHome(busy = true, messages = emptyList()))
        assertFalse(AsterCompanion.isHome(busy = true, messages = listOf(greeting)))
    }

    @Test
    fun `quick actions match the desktop and start the sentence`() {
        assertEquals(listOf("Plan a project", "Write code", "Analyze a file", "Explore ideas"), AsterCompanion.QUICK_ACTIONS.map { it.title })
        val plan = AsterCompanion.QUICK_ACTIONS.first()
        assertEquals("Help me plan a project: ", AsterCompanion.draftAfter(plan, ""))
        assertEquals("Draft so far Help me plan a project: ", AsterCompanion.draftAfter(plan, "Draft so far  "))
        assertTrue(AsterCompanion.QUICK_ACTIONS.single { it.attach }.title == "Analyze a file")
        // every chip glyph comes from the existing quick-reply table, not a fallback dot
        AsterCompanion.QUICK_ACTIONS.forEach { assertTrue(quickReplyGlyph(it.icon) != "•", it.icon) }
    }

    @Test
    fun `a reader's own quick reply is never mistaken for a quick action`() {
        assertEquals(AsterCompanion.QUICK_ACTIONS[1], AsterCompanion.quickActionFor(AsterCompanion.QUICK_ACTION_CHIPS[1]))
        assertNull(AsterCompanion.quickActionFor(PredictiveChip(title = "Run tests", prompt = "Run the tests", icon = "tests")))
        assertNull(AsterCompanion.quickActionFor(PredictiveChip(title = "Write code", prompt = "something else")))
    }

    @Test
    fun `the home composer invites the first message`() {
        assertEquals(AsterCompanion.HOME_PLACEHOLDER, ComposerPromise.placeholder(name = "Koda", busy = false, engineCanSteer = false, sending = false, listening = false, home = true))
        assertEquals("Ask Koda", ComposerPromise.placeholder(name = "Koda", busy = false, engineCanSteer = false, sending = false, listening = false))
    }
}
