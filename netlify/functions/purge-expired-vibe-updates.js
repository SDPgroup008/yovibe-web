const { getAdminClient } = require('../shared/supabaseAdmin');
const { deleteObject } = require('../shared/r2');

// The scheduler calls this daily. Media remains recoverable for 24 hours after
// expiry/soft deletion, then both the public object and database row are purged.
exports.handler = async () => {
  try {
    const admin = getAdminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: updates, error } = await admin.from('vibe_updates').select('id,media_key')
      .or(`expires_at.lt.${cutoff},deleted_at.lt.${cutoff}`).limit(200);
    if (error) throw error;
    let deleted = 0;
    for (const update of updates || []) {
      try {
        await deleteObject('public', update.media_key);
        const { error: deleteError } = await admin.from('vibe_updates').delete().eq('id', update.id);
        if (deleteError) throw deleteError;
        deleted += 1;
      } catch (itemError) {
        console.error('[VibeUpdatePurge] Failed:', update.id, itemError.message);
      }
    }
    return { statusCode: 200, body: JSON.stringify({ deleted }) };
  } catch (error) {
    console.error('[VibeUpdatePurge] Error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Purge failed' }) };
  }
};
