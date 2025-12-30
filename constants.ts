
export const COLUMN_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
export const COLUMN_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
export const COLUMN_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

export const getColumn = (num: number): number => {
  if (num === 0) return 0;
  if (COLUMN_1.includes(num)) return 1;
  if (COLUMN_2.includes(num)) return 2;
  if (COLUMN_3.includes(num)) return 3;
  return 0;
};

export const SOUND_URLS = {
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  LOSS: 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3',
  OBSERVATION: 'https://assets.mixkit.co/active_storage/sfx/2022/2022-preview.mp3'
};
