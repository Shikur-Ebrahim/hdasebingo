/**
 * PWA Manifest Synchronization Utility
 * Dynamically binds the user's active/invited room and promoter referral into
 * the Web App Manifest (manifest.webmanifest).
 * 
 * When the user installs the PWA from Chrome (or browser), Chrome's WebAPK minting
 * service compiles a native Android APK with start_url set to:
 *   /?source=pwa&room=TARGET_ROOM&ref=TARGET_REF
 * 
 * When this installed APK is shared via Xender, Zapya, Bluetooth, or Telegram to other
 * devices, the recipient device will automatically open directly into the same room!
 */
export function syncManifestWithRoom(roomId?: string | null, refId?: string | null) {
  if (typeof document === 'undefined') return;
  try {
    const mLink = document.getElementById('app-manifest') as HTMLLinkElement | null;
    if (!mLink) return;

    let targetRoom = roomId || (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null) || '';
    let targetRef = refId || (typeof window !== 'undefined' ? localStorage.getItem('hdase_promoter_ref') : null) || '';

    if (targetRoom.startsWith('room_')) targetRoom = targetRoom.replace('room_', '');
    if (targetRef.startsWith('ref_')) targetRef = targetRef.replace('ref_', '');

    if (targetRoom) {
      const q = new URLSearchParams();
      q.set('room', targetRoom);
      if (targetRef) q.set('ref', targetRef);
      mLink.href = `/api/player/manifest?${q.toString()}`;
    }
  } catch (_) {}
}
