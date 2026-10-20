/* Smart-watch reconnaissance: capabilities accumulate with item rarity. */
'use strict';
EJ.watch = (() => {
  const descriptions = [
    'Мини-карта посещённых комнат.',
    'Мини-карта посещённых и соседних комнат, состояние проходов.',
    'Посещённые и соседние комнаты, проходы; задания, элита и охрана в посещённых комнатах.',
    'Полный план этажа и проходы; задания, элита и охрана в посещённых комнатах. Предупреждает о приближении патруля.',
  ];
  const grade = P => P && Number.isInteger(P.inv?.smartwatch) ? P.inv.smartwatch : -1;
  const description = g => descriptions[g] || descriptions[0];
  function knownRooms(G) {
    const g = grade(G.player), known = new Set();
    if (g < 0) return known;
    for (const R of G.L.rooms) {
      if (g >= 3 || R.visited) known.add(R.id);
      if (g >= 1 && R.visited) R.links.forEach(id => known.add(id));
    }
    return known;
  }
  function canTrack(G, x, y) {
    return grade(G.player) >= 2 && !!EJ.level.roomOf(G.L, x, y)?.visited;
  }
  function updateAlerts(G, dt) {
    G.watchAlertCooldown = Math.max(0, (G.watchAlertCooldown || 0) - dt);
    const near = grade(G.player) >= 3 && G.enemies.some(e => e.patrol && !e.dead && e.hp > 0 &&
      EJ.dist(e.x, e.y, G.player.x, G.player.y) <= 8);
    if (near && !G.watchPatrolNear && !G.watchAlertCooldown) {
      G.hud.alert('СМАРТ-ЧАСЫ · ОХРАНА ПРИБЛИЖАЕТСЯ');
      EJ.audio.play('ui');
      G.watchAlertCooldown = 12;
    }
    G.watchPatrolNear = near;
  }
  return { grade, description, knownRooms, canTrack, updateAlerts };
})();
