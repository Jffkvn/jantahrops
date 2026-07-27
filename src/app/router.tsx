import { createBrowserRouter } from 'react-router';
import App from './App';
import StyleguidePage from './styleguide';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/styleguide',
    element: <StyleguidePage />,
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
