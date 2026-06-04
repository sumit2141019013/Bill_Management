import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Zap, IndianRupee, CalendarDays, ArrowRight, Plus, TrendingUp, HelpCircle } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ToastContext';

export default function Dashboard() {
  const [tenants, setTenants] = useState([]);
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    loadData(true);

    const interval = setInterval(() => {
      loadData(false);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function loadData(showSpinner = false) {
    if (showSpinner) setLoading(true);
    else setIsRefreshing(true);
    try {
      const [tenantsData, monthsData] = await Promise.all([
        api.getTenants(),
        api.getMonths()
      ]);
      setTenants(tenantsData);
      setMonths(monthsData);

      // Load current month details if exists
      const openMonth = monthsData.find(m => !m.is_closed);
      if (openMonth) {
        const details = await api.getMonth(openMonth.id);
        setCurrentMonth(details);
      } else {
        setCurrentMonth(null);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      if (showSpinner) {
        showToast('Failed to load dashboard data: ' + err.message, 'error');
      }
    } finally {
      if (showSpinner) setLoading(false);
      else setTimeout(() => setIsRefreshing(false), 800);
    }
  }

  const regularTenants = tenants.filter(t => !t.is_admin);
  const activeTenants = regularTenants.filter(t => t.is_active);
  const totalMonths = months.length;
  const lastClosedMonth = months.find(m => m.is_closed);

  const currentBillTotal = currentMonth?.billShares?.reduce((sum, s) => sum + s.total_amount, 0) || 0;
  const currentUnitsUsed = currentMonth ? 
    (currentMonth.events?.length > 1 ? 
      currentMonth.events[currentMonth.events.length - 1].meter_reading - currentMonth.start_reading : 0) : 0;

  // Process data for the SVG Chart (last 6 months, chronological)
  const chartData = months.length > 0 ? [...months]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(m => {
      const isCurrent = currentMonth && m.id === currentMonth.id;
      const units = isCurrent 
        ? currentUnitsUsed 
        : (m.end_reading ? (m.end_reading - m.start_reading) : 0);
      const amount = isCurrent 
        ? currentBillTotal 
        : (units * m.rate_per_unit);
      return {
        monthName: m.month,
        units: Math.round(units * 100) / 100,
        amount: Math.round(amount),
      };
    }) : [];

  // SVG Chart Calculations
  const maxAmount = chartData.length > 0 ? Math.max(...chartData.map(d => d.amount), 100) : 100;
  const width = 500;
  const height = 200;
  const paddingX = 45;
  const paddingY = 25;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = chartData.map((d, i) => {
    const x = paddingX + i * (chartWidth / (chartData.length - 1 || 1));
    const y = height - paddingY - (d.amount / maxAmount) * chartHeight;
    return { x, y, data: d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z` 
    : '';

  if (loading) {
    return (
      <div className="page flex-center" style={{ minHeight: '60vh' }}>
        <div className="empty-state">
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }}>
            <Zap size={32} style={{ color: 'var(--primary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          <h3>Loading dashboard overview...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-header flex-between">
        <div>
          <h2>⚡ Dashboard</h2>
          <p>Overview of your room's electricity billing</p>
        </div>
        <div className="flex gap-1" style={{ alignItems: 'center' }}>
          {isRefreshing && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', animation: 'fadeIn 0.5s infinite alternate' }}>
              Refreshing...
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid-4 mb-3">
        <div className="stat-card">
          <div className="stat-icon purple"><Users size={20} /></div>
          <div className="stat-value">{activeTenants.length}</div>
          <div className="stat-label">Active Tenants</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Zap size={20} /></div>
          <div className="stat-value">{Math.round(currentUnitsUsed * 100) / 100}</div>
          <div className="stat-label">Units This Month</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><IndianRupee size={20} /></div>
          <div className="stat-value">₹{Math.round(currentBillTotal)}</div>
          <div className="stat-label">Running Bill</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><CalendarDays size={20} /></div>
          <div className="stat-value">{totalMonths}</div>
          <div className="stat-label">Total Months</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Current Month Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Zap size={18} className="icon" />
              Current Month
            </div>
            {currentMonth ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <span className="badge badge-warning">No Active Month</span>
            )}
          </div>

          {currentMonth ? (
            <div>
              <div className="flex-between mb-2">
                <div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Month</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{currentMonth.month}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Start Reading</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{currentMonth.start_reading}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Rate: ₹{currentMonth.rate_per_unit}/unit
              </div>

              {currentMonth.billShares && currentMonth.billShares.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="mt-2">
                  {currentMonth.billShares.map((share, idx) => {
                    const sharePercent = currentBillTotal > 0 ? (share.total_amount / currentBillTotal) * 100 : 0;
                    // Harmonized dynamic gradient colors for progress bars
                    const gradients = [
                      'linear-gradient(90deg, #6366f1, #8b5cf6)',
                      'linear-gradient(90deg, #10b981, #059669)',
                      'linear-gradient(90deg, #f59e0b, #d97706)',
                      'linear-gradient(90deg, #3b82f6, #1d4ed8)'
                    ];
                    const gradient = gradients[idx % gradients.length];
                    
                    return (
                      <div key={share.tenant_id} className="progress-share-item">
                        <div className="flex-between mb-1" style={{ fontSize: '0.88rem' }}>
                          <span style={{ fontWeight: 600 }}>{share.tenant_name}</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            ₹{Math.round(share.total_amount)} <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.78rem' }}>({Math.round(share.total_units * 100) / 100} units)</span>
                          </span>
                        </div>
                        <div className="progress-bar-bg" style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                          <div 
                            className="progress-bar-fill" 
                            style={{ 
                              width: `${sharePercent}%`, 
                              height: '100%', 
                              background: gradient, 
                              borderRadius: '4px',
                              boxShadow: '0 0 10px rgba(99, 102, 241, 0.2)',
                              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                          ></div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {Math.round(sharePercent)}% of total room bill
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button className="btn btn-primary mt-3" onClick={() => navigate(`/month/${currentMonth.id}`)} style={{ width: '100%', justifyContent: 'center' }}>
                View Details <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={40} className="empty-icon" />
              <h3>No Active Month</h3>
              <p>Start a new billing month to begin tracking</p>
              <button className="btn btn-primary mt-2" onClick={() => navigate('/billing')}>
                <Plus size={16} /> Start New Month
              </button>
            </div>
          )}
        </div>

        {/* Tenants Overview */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Users size={18} className="icon" />
              Tenants
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/tenants')}>
              Manage <ArrowRight size={14} />
            </button>
          </div>

          {regularTenants.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {regularTenants.map(tenant => (
                <div key={tenant.id} className="flex-between tenant-list-item-hover" style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div className="flex gap-1" style={{ alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: tenant.is_active ? 'var(--accent-gradient)' : 'var(--bg-glass)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.9rem',
                      color: tenant.is_active ? 'white' : 'var(--text-muted)'
                    }}>
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tenant.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Since {tenant.joined_date}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${tenant.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {tenant.is_active ? 'IN' : 'OUT'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={40} className="empty-icon" />
              <h3>No Tenants Yet</h3>
              <p>Add tenants to start tracking bills</p>
              <button className="btn btn-primary mt-2" onClick={() => navigate('/tenants')}>
                <Plus size={16} /> Add Tenants
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Analytics & Recent History Grid */}
      <div className="grid-2 mt-3">
        {/* Billing Trend Chart (SVG) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <TrendingUp size={18} className="icon" />
              Billing Trend (Last 6 Months)
            </div>
          </div>
          {chartData.length > 1 ? (
            <div className="chart-wrapper" style={{ position: 'relative' }}>
              <svg 
                viewBox={`0 0 ${width} ${height}`} 
                className="billing-svg-chart"
                style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
              >
                <defs>
                  {/* Glowing line filter */}
                  <filter id="chart-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  {/* Area fill gradient */}
                  <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis helper lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = paddingY + ratio * chartHeight;
                  const labelVal = Math.round(maxAmount - ratio * maxAmount);
                  return (
                    <g key={i}>
                      <line 
                        x1={paddingX} 
                        y1={y} 
                        x2={width - paddingX} 
                        y2={y} 
                        stroke="rgba(255,255,255,0.04)" 
                        strokeDasharray="4 4" 
                      />
                      <text 
                        x={paddingX - 8} 
                        y={y + 4} 
                        fill="var(--text-muted)" 
                        fontSize="9" 
                        textAnchor="end"
                      >
                        ₹{labelVal}
                      </text>
                    </g>
                  );
                })}

                {/* Gradient Area Fill */}
                <path d={areaPath} fill="url(#chart-gradient)" />

                {/* Spark Line */}
                <path 
                  d={linePath} 
                  fill="none" 
                  stroke="var(--accent-primary-hover)" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  filter="url(#chart-glow)"
                />

                {/* Hover Columns (Transparent bars for easier mouse interaction) */}
                {points.map((p, i) => {
                  const barWidth = chartWidth / (chartData.length - 1 || 1);
                  const xStart = p.x - barWidth / 2;
                  return (
                    <rect
                      key={i}
                      x={xStart}
                      y={paddingY}
                      width={barWidth}
                      height={chartHeight}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPoint({ ...p, index: i })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  );
                })}

                {/* Interaction points (Circles) */}
                {points.map((p, i) => {
                  const isHovered = hoveredPoint && hoveredPoint.index === i;
                  return (
                    <g key={i}>
                      {isHovered && (
                        <circle 
                          cx={p.x} 
                          cy={p.y} 
                          r="8" 
                          fill="rgba(99, 102, 241, 0.25)" 
                        />
                      )}
                      <circle 
                        cx={p.x} 
                        cy={p.y} 
                        r={isHovered ? "5" : "4"} 
                        fill={isHovered ? "white" : "var(--accent-primary-hover)"} 
                        stroke="var(--bg-secondary)" 
                        strokeWidth="1.5"
                        style={{ transition: 'r 0.1s ease, fill 0.1s ease' }}
                      />
                    </g>
                  );
                })}

                {/* X Axis Labels */}
                {points.map((p, i) => (
                  <text 
                    key={i} 
                    x={p.x} 
                    y={height - paddingY + 14} 
                    fill="var(--text-muted)" 
                    fontSize="9" 
                    textAnchor="middle"
                  >
                    {p.data.monthName.split('-')[1]}/{p.data.monthName.split('-')[0].substring(2)}
                  </text>
                ))}
              </svg>

              {/* Chart Tooltip */}
              {hoveredPoint && (
                <div 
                  className="chart-tooltip-bubble"
                  style={{
                    position: 'absolute',
                    left: `${(hoveredPoint.x / width) * 100}%`,
                    top: `${(hoveredPoint.y / height) * 100 - 32}%`,
                    transform: 'translate(-50%, -100%)',
                    pointerEvents: 'none',
                    zIndex: 10
                  }}
                >
                  <div className="tooltip-title">{hoveredPoint.data.monthName}</div>
                  <div className="tooltip-value">Bill: ₹{hoveredPoint.data.amount}</div>
                  <div className="tooltip-sub">Usage: {hoveredPoint.data.units} units</div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <TrendingUp size={36} className="empty-icon" />
              <h3>Awaiting Billing Trend</h3>
              <p>Add and close at least 2 billing months to see progression trends.</p>
            </div>
          )}
        </div>

        {/* Recent History Table */}
        {months.length > 0 ? (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <TrendingUp size={18} className="icon" />
                Recent Months
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => navigate('/history')}>
                View All <ArrowRight size={14} />
              </button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Units</th>
                    <th>Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {months.slice(0, 4).map(m => {
                    const units = m.end_reading ? m.end_reading - m.start_reading : (currentMonth && m.id === currentMonth.id ? currentUnitsUsed : null);
                    return (
                      <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/month/${m.id}`)}>
                        <td style={{ fontWeight: 600 }}>{m.month}</td>
                        <td>{units !== null ? Math.round(units * 100) / 100 : '—'}</td>
                        <td>₹{m.rate_per_unit}/u</td>
                        <td>
                          <span className={`badge ${m.is_closed ? 'badge-info' : 'badge-success'}`}>
                            {m.is_closed ? 'Closed' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card flex-center">
            <div className="empty-state">
              <CalendarDays size={40} className="empty-icon" />
              <h3>No Billing Records</h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
