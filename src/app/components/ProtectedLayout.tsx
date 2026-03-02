import { ProtectedRoute } from './ProtectedRoute';
import Layout from './Layout';

export const ProtectedLayout = () => {
  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  );
};
