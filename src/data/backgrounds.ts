export type BackgroundPhoto = { id: string; src: string; label: string };

export const backgroundPhotos: BackgroundPhoto[] = [
  { id: 'bg', src: '/backgrounds/bg.jpeg', label: 'Night (original)' },
  { id: 'bg001', src: '/backgrounds/bg001.jpg', label: 'Photo 1' },
  { id: 'bg002', src: '/backgrounds/bg002.jpg', label: 'Photo 2' },
  { id: 'bg003', src: '/backgrounds/bg003.jpg', label: 'Photo 3' },
  { id: 'bg005', src: '/backgrounds/bg005.jpg', label: 'Photo 5' },
  { id: 'bg006', src: '/backgrounds/bg006.jpg', label: 'Photo 6' },
  { id: 'bg007', src: '/backgrounds/bg007.jpg', label: 'Photo 7' },
  { id: 'bg008', src: '/backgrounds/bg008.jpg', label: 'Photo 8' },
  { id: 'bg009', src: '/backgrounds/bg009.jpg', label: 'Photo 9' },
  { id: 'bg010', src: '/backgrounds/bg010.jpg', label: 'Photo 10' },
  { id: 'bg011', src: '/backgrounds/bg011.jpg', label: 'Photo 11' },
  { id: 'bg012', src: '/backgrounds/bg012.jpg', label: 'Photo 12' },
  { id: 'bg013', src: '/backgrounds/bg013.jpg', label: 'Photo 13' },
  { id: 'bg014', src: '/backgrounds/bg014.jpg', label: 'Photo 14' },
  { id: 'bg015', src: '/backgrounds/bg015.jpg', label: 'Photo 15' },
  { id: 'bg016', src: '/backgrounds/bg016.jpg', label: 'Photo 16' },
  { id: 'bg017', src: '/backgrounds/bg017.jpg', label: 'Photo 17' },
  { id: 'bg018', src: '/backgrounds/bg018.jpg', label: 'Photo 18' },
  { id: 'bg019', src: '/backgrounds/bg019.jpg', label: 'Photo 19' },
  { id: 'bg020', src: '/backgrounds/bg020.jpg', label: 'Photo 20' },
];

export const defaultPhotoId = 'bg';

export function photoById(id: string): BackgroundPhoto {
  return (
    backgroundPhotos.find((photo) => photo.id === id) ??
    backgroundPhotos.find((photo) => photo.id === defaultPhotoId)!
  );
}

export function randomPhotoId(
  exclude?: string,
  random: () => number = Math.random,
): string {
  const pool = backgroundPhotos.filter((photo) => photo.id !== exclude);
  const list = pool.length ? pool : backgroundPhotos;
  const index = Math.min(list.length - 1, Math.floor(random() * list.length));
  return list[index]!.id;
}
