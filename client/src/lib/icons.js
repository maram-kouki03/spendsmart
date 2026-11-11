// Stroke icon paths from the SpendSmart design (24×24 viewBox).
export const I = {
  wallet: 'M19 7V5.5A1.5 1.5 0 0 0 17.5 4H6a2 2 0 0 0 0 4h13.5a.5.5 0 0 1 .5.5V19a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm6 9 6 6 6-6',
  warn: 'M12 3.5 2.5 20h19zM12 10v4.5M12 17.2h.01',
  alert: 'M12 7.5v5.5M12 16.3h.01',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10 21a2.2 2.2 0 0 0 4 0',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z',
  user: 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
  mail: 'm4 7 8 6 8-6',
  lock: 'M8 10V7a4 4 0 0 1 8 0v3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  down: 'M7 7l10 10M17 8v9H8',
  up: 'M17 17 7 7M7 16V7h9',
  search: 'm20 20-3.5-3.5',
  play: 'M8 5.5v13l10-6.5z'
};

export const CAT_ICON = {
  Food: 'M5 3v7a3 3 0 0 0 6 0V3M8 3v18M18 3c-2.2 0-3.5 2.2-3.5 6s1.3 5 3.5 5v7',
  Coffee: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9.5h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5v3M12 2.5v3',
  Groceries: 'M2.5 3.5h3l2.4 11.5h10.6l2-8H6.3M9.5 20.5h.01M17.5 20.5h.01',
  Makeup: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  Transport: 'M5 4h14a1 1 0 0 1 1 1v11H4V5a1 1 0 0 1 1-1zM4 11h16M7.5 16v3M16.5 16v3M8 13.5h.01M16 13.5h.01',
  Bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  Shopping: 'M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9zM9 8V6.5a3 3 0 0 1 6 0V8',
  More: 'M5 12h.01M12 12h.01M19 12h.01',
  Income: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  Savings: 'M5 11a7 6 0 0 1 13-2.5h1.5v4l-1.6 1A7 6 0 0 1 15 17v3h-3v-2h-2v2H7v-3.2A6 6 0 0 1 5 11zM15 11h.01'
};
export const CATEGORIES = ['Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'];

export const NAV = [
  ['dashboard', 'Dashboard', '/dashboard', 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['transactions', 'Transactions', '/transactions', 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3'],
  ['add', 'Add a purchase', '/add', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8'],
  ['purchases', 'My purchases', '/purchases', 'M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9zM9 8V6.5a3 3 0 0 1 6 0V8'],
  ['budgets', 'Budgets', '/budgets', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z'],
  ['shared', 'Shared expenses', '/shared', 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20c0-2.8-1.6-5-4-6'],
  ['subscriptions', 'Subscriptions', '/subscriptions', 'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4'],
  ['goals', 'Savings goals', '/goals', 'M5 11a7 6 0 0 1 13-2.5h1.5v4l-1.6 1A7 6 0 0 1 15 17v3h-3v-2h-2v2H7v-3.2A6 6 0 0 1 5 11zM15 11h.01'],
  ['settings', 'Settings', '/settings', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1']
];

export const SUB_ICON = {
  play: 'M8 5.5v13l10-6.5z',
  music: 'M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 17.5 18z',
  gym: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12',
  news: 'M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
  game: 'M6 8h12a4 4 0 0 1 0 8h-1l-2-2H9l-2 2H6a4 4 0 0 1 0-8zM8 11v2M7 12h2M16 11h.01M18 13h.01',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'
};
export const SUB_COLOR = {
  cocoa: ['#57400A', '#FFF0B3'], green: ['#DCFCE7', '#15803D'], blue: ['#DBEAFE', '#1D4ED8'],
  butter: ['#FFF0B3', '#57400A'], violet: ['#EDE9FE', '#5B21B6'], pink: ['#FCE7F3', '#9D174D']
};

export const GOAL_ICON = {
  laptop: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10H4zM2 19h20',
  plane: 'M2.5 15.5 21 8l-1-2-6.5 2.5L8 4 6 5l3.5 5-4.5 1.8L3 10l-1.5 1z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z',
  phone: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18.5h2',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  gift: 'M4 9h16v4H4zM5 13h14v8H5zM12 9v12M12 9S10.5 4 8 4.5 7.5 9 12 9zM12 9s1.5-5 4-4.5S16.5 9 12 9z',
  star: SUB_ICON.star
};

// Avatar colors for people (bg, fg), picked by a stable hash of the id.
export const AVATARS = [['#FBCFE8', '#9D174D'], ['#BFDBFE', '#1E3A8A'], ['#BBF7D0', '#14532D'], ['#DDD6FE', '#4C1D95'], ['#FED7AA', '#7C2D12'], ['#FFF0B3', '#57400A']];
export function avatarFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
