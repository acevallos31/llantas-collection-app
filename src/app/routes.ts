import { createBrowserRouter } from 'react-router';
import { ProtectedLayout } from './components/ProtectedLayout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import HomePage from './pages/HomePage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';
import HistoryPage from './pages/HistoryPage.tsx';
import RewardsPage from './pages/RewardsPage.tsx';
import NewCollectionPage from './pages/NewCollectionPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import CollectionDetailPage from './pages/CollectionDetailPage.tsx';
import CollectorDashboardPage from './pages/CollectorDashboardPage.tsx';
import AdminPointsPage from './pages/AdminPointsPage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';
import AdminRewardsPricingPage from './pages/AdminRewardsPricingPage.tsx';
import AdminPaymentsPage from './pages/AdminPaymentsPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: ProtectedLayout,
    children: [
      {
        path: 'home',
        Component: HomePage,
      },
      {
        path: 'collector',
        Component: CollectorDashboardPage,
      },
      {
        path: 'admin',
        Component: AdminDashboardPage,
      },
      {
        path: 'profile',
        Component: ProfilePage,
      },
      {
        path: 'history',
        Component: HistoryPage,
      },
      {
        path: 'history/:collectionId',
        Component: CollectionDetailPage,
      },
      {
        path: 'rewards',
        Component: RewardsPage,
      },
      {
        path: 'new-collection',
        Component: NewCollectionPage,
      },
      {
        path: 'settings',
        Component: SettingsPage,
      },
      {
        path: 'admin-points',
        Component: AdminPointsPage,
      },
      {
        path: 'admin-rewards-pricing',
        Component: AdminRewardsPricingPage,
      },
      {
        path: 'admin-payments',
        Component: AdminPaymentsPage,
      },
    ],
  },
]);