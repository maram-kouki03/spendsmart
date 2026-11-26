import { lazy } from 'react';

/*
 * App pages are code-split: each one is downloaded the first time it's opened. Landing and Login
 * stay in the main bundle because they are the first screens.
 */
const loadDashboard = () => import('./Dashboard.jsx');

/** Starts downloading the dashboard (and its charts) right after a successful log-in, so it opens instantly. */
export const preloadDashboard = () => {
  loadDashboard().catch(() => {
    /* retried when the route renders */
  });
};

export const Dashboard = lazy(loadDashboard);
export const Transactions = lazy(() => import('./Transactions.jsx'));
export const AddPurchase = lazy(() => import('./AddPurchase.jsx'));
export const PurchaseSaved = lazy(() => import('./PurchaseSaved.jsx'));
export const Purchases = lazy(() => import('./Purchases.jsx'));
export const Budgets = lazy(() => import('./Budgets.jsx'));
export const Shared = lazy(() => import('./Shared.jsx'));
export const Subscriptions = lazy(() => import('./Subscriptions.jsx'));
export const Goals = lazy(() => import('./Goals.jsx'));
export const Settings = lazy(() => import('./Settings.jsx'));
export const ResetPassword = lazy(() => import('./ResetPassword.jsx'));
