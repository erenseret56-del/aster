package com.openmausbot.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openmausbot.companion.R

/**
 * The phone's version of the desktop's navigation rail (NavigationRail.tsx):
 * the same places, as a floating capsule of chrome at the bottom of the
 * top-level screens. It paints on [chrome], so it is ASTER glass under the
 * ASTER skins and each other skin's own chrome everywhere else.
 */
@Composable
fun AsterTabBar(
    current: AsterTab,
    onSelect: (AsterTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val look = LocalAsterLook.current
    val activeTint = look?.violet ?: MaterialTheme.colorScheme.primary
    val idleTint = MaterialTheme.colorScheme.onSurfaceVariant
    val shape = RoundedCornerShape(26.dp)
    Row(
        modifier = modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .chrome(shape)
            .padding(horizontal = 6.dp, vertical = 6.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsterTab.entries.forEach { tab ->
            val selected = tab == current
            val tint = if (selected) activeTint else idleTint
            Column(
                modifier = Modifier
                    .weight(1f)
                    .background(
                        if (selected) activeTint.copy(alpha = 0.16f) else Color.Transparent,
                        RoundedCornerShape(20.dp),
                    )
                    .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(painter = tab.icon(), contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
                Text(
                    text = tab.label,
                    fontSize = 11.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    color = tint,
                    modifier = Modifier.padding(top = 2.dp).height(14.dp),
                )
            }
        }
    }
}

/** The rail's words, so the phone and the desktop name each place the same. */
val AsterTab.label: String
    get() = when (this) {
        AsterTab.HOME -> "Home"
        AsterTab.CHATS -> "Chats"
        AsterTab.ROUTINES -> "Routines"
        AsterTab.APPS -> "Apps"
        AsterTab.SETTINGS -> "Settings"
    }

@Composable
private fun AsterTab.icon(): Painter = when (this) {
    AsterTab.HOME -> rememberVectorPainter(Icons.Outlined.Home)
    AsterTab.CHATS -> painterResource(R.drawable.ic_chat_bubbles)
    AsterTab.ROUTINES -> painterResource(R.drawable.ic_schedule)
    AsterTab.APPS -> painterResource(R.drawable.ic_hub)
    AsterTab.SETTINGS -> rememberVectorPainter(Icons.Outlined.Settings)
}
