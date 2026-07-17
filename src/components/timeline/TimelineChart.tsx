import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { LogStats } from '../../types/log'

interface TimelineChartProps {
  stats: LogStats | null
}

export default function TimelineChart({ stats }: TimelineChartProps) {
  if (!stats?.timeline.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        暂无时间线数据 No timeline data
      </div>
    )
  }

  const data = stats.timeline.slice(-50)

  return (
    <div className="h-40 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3e3e42" />
          <XAxis
            dataKey="bucket"
            tick={{ fill: '#6e6e6e', fontSize: 10 }}
            interval="preserveStartEnd"
            tickFormatter={(val: string) => {
              // 只显示时间部分 (如 "14:30")
              const parts = val.split(' ')
              return parts.length > 1 ? parts[1] : val
            }}
          />
          <YAxis tick={{ fill: '#6e6e6e', fontSize: 10 }} width={30} />
          <Tooltip
            contentStyle={{ background: '#2d2d30', border: '1px solid #3e3e42', fontSize: 12 }}
          />
          <Bar dataKey="count" fill="#007acc" name="总数 Total" />
          <Bar dataKey="errors" fill="#f14c4c" name="错误 Errors" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
