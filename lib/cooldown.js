async function checkCooldown(db, sender, command, seconds) {
  if (!seconds) return 0;
  const key = `cooldown:${sender}:${command}`;
  const until = await db.get(key, 0);
  if (until > Date.now()) return Math.ceil((until - Date.now()) / 1000);
  await db.set(key, Date.now() + seconds * 1000); return 0;
}
module.exports = { checkCooldown };
