import { createBrowserRouter } from 'react-router';
import { ProtectedLayout } from './components/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import HistoryPage from './pages/HistoryPage';
import RewardsPage from './pages/RewardsPage';
import NewCollectionPage from './pages/NewCollectionPage';
import SettingsPage from './pages/SettingsPage';
import CollectionDetailPage from './pages/CollectionDetailPage';
import CollectorDashboardPage from './pages/CollectorDashboardPage';
import AdminPointsPage from './pages/AdminPointsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

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
    ],
  },
]);