export interface BlameLegendUser {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Props {
  users: BlameLegendUser[];
}

/**
 * Bottom strip shown in blame mode listing all contributing users and their
 * colour swatch. Purely informational; does not intercept events.
 */
export function BlameModeLegend({ users }: Props) {
  if (users.length === 0) return null;

  return (
    <div
      aria-label="Blame mode legend"
      style={{
        position: 'fixed',
        bottom: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(15,23,42,0.92)',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 999,
        padding: '6px 16px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        flexWrap: 'wrap',
        maxWidth: '90vw',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        👤 BLAME MODE
      </span>
      <div style={{ width: 1, height: 14, background: 'rgba(99,102,241,0.3)' }} />
      {users.map((u) => (
        <div
          key={u.id}
          style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: u.color,
              display: 'inline-block',
              flexShrink: 0,
              boxShadow: `0 0 6px ${u.color}88`,
            }}
          />
          <span style={{ fontSize: 11, color: '#e2e8f0' }}>{u.name}</span>
          <span
            style={{
              fontSize: 10,
              color: '#475569',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 4,
              padding: '0 4px',
            }}
          >
            {u.count}
          </span>
        </div>
      ))}
    </div>
  );
}
