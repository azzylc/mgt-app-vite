import { Suspense } from 'react';
import IzinHakkiDuzenleClient from './IzinHakkiDuzenleClient';

export default function IzinHakkiDuzenlePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-warm">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    }>
      <IzinHakkiDuzenleClient />
    </Suspense>
  );
}
