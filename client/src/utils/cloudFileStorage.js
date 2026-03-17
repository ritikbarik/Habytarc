import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebase';

const sanitizeName = (value = 'file') =>
  String(value || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';

export const uploadCloudFile = async (file, uid, category = 'materials') => {
  if (!(file instanceof File)) {
    throw new Error('A browser file is required.');
  }

  if (!uid) {
    throw new Error('A signed-in user is required to upload files.');
  }

  const safeName = sanitizeName(file.name || 'file');
  const storagePath = `users/${uid}/${category}/${Date.now()}_${Math.floor(Math.random() * 100000)}_${safeName}`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      ownerUid: String(uid),
      originalName: String(file.name || safeName)
    }
  });

  const downloadURL = await getDownloadURL(fileRef);
  return {
    path: storagePath,
    downloadURL,
    name: String(file.name || safeName),
    type: String(file.type || 'application/octet-stream'),
    size: Number(file.size || 0)
  };
};

export const deleteCloudFile = async (storagePath = '') => {
  const cleanPath = String(storagePath || '').trim();
  if (!cleanPath) return;
  await deleteObject(ref(storage, cleanPath));
};
