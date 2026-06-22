import React from 'react';
import WorkshopPage from './WorkshopPage';
import { useRoleConfig } from './RoleConfigContext';

function Carpenter() {
  const { getRoleMetaByKey } = useRoleConfig();
  const roleMeta = getRoleMetaByKey('carpenter');
  return (
    <WorkshopPage
      role="carpenter"
      title={`${roleMeta?.icon || '🪚'} ${roleMeta?.shortTitle || 'Столярный цех'}`}
      description={roleMeta?.description || 'Раскрой древесины, фрезеровка и шлифовка деталей'}
    />
  );
}

export default Carpenter;
