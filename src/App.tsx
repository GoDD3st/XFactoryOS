/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider } from '@/frontend/src/modules/auth/context/AuthContext';
import { AuthGate } from '@/frontend/src/modules/auth/components/AuthGate';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
