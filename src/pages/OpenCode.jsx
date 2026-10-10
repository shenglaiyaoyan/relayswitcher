import React from 'react';
import { Icon } from '../components/ui.jsx';

// 占位页:Task 4 重写为完整 Provider 管理(消费 rs:oc:* IPC)
export default function OpenCode() {
  return (
    <div>
      <div className="klabel"><Icon name="bolt" size={12} style={{ color: 'var(--gold)' }} /> OpenCode Providers</div>
      <div className="muted" style={{ padding: 40, textAlign: 'center' }}>Provider 管理即将上线(Task 4 实现)</div>
    </div>
  );
}
