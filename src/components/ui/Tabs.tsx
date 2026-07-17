import clsx from 'clsx'

interface TabsProps {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-4 py-2 text-sm transition-colors',
            active === tab.id
              ? 'border-b-2 border-accent text-accent'
              : 'text-secondary hover:text-primary',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
