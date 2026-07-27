import { createBrowserRouter } from 'react-router';
import App from './App';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '*',
    element: (
      <main className="p-8">
        <h1 className="text-xl font-semibold">404 - Not Found</h1>
      </main>
    ),
  },
]);
