import { createBrowserRouter } from 'react-router';
import { ProtectedLayout } from './components/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import HistoryPage from './pages/HistoryPage';
import RewardsPage from './pages/RewardsPage';
import NewCollectionPage from './pages/NewCollectionPage';
import SettingsPage from './pages/SettingsPage';

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
        path: 'profile',
        Component: ProfilePage,
      },
      {
        path: 'history',
        Component: HistoryPage,
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
    ],
  },
]);