import React from 'react';
import WorkshopPage from './WorkshopPage';
import { useRoleConfig } from './RoleConfigContext';

function Assembler() {
  const { getRoleMetaByKey } = useRoleConfig();
  const roleMeta = getRoleMetaByKey('assembler');
  return (
    <WorkshopPage
      role="assembler"
      title={`${roleMeta?.icon || '🔧'} ${roleMeta?.shortTitle || 'Сборочный цех'}`}
      description={roleMeta?.description || 'Сборка изделий, установка фурнитуры и упаковка'}
    />
  );
}

export default Assembler;
