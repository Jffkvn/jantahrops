import type { JSX } from 'react';

export function App(): JSX.Element {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">JantaHR Ops</h1>
      {/* TODO(0.2): replace with token colour */}
      <p className="mt-2 text-gray-600">Scaffold ready.</p>
    </main>
  );
}

export default App;
