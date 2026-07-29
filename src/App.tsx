/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider } from '../frontend/src/modules/auth/context/AuthContext';
import { RoleShell } from '../frontend/src/shared/components/RoleShell';

export default function App() {
  return (
    <AuthProvider>
      <RoleShell />
    </AuthProvider>
  );
}
