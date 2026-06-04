import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Eye, Download, CalendarDays, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmContext';

export default function BillHistory() {
  const { currentTenant } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadMonths();
  }, []);

  async function loadMonths() {
    try {
      const data = await api.getMonths();
      setMonths(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(monthId) {
    try {
      showToast('Preparing Excel export...', 'info');
      await api.exportExcel(monthId);
      showToast('Excel file downloaded successfully!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <h2>📜 Billing History</h2>
        <p>View and export past billing months</p>
      </div>

      {months.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <History size={48} className="empty-icon" />
            <h3>No Billing History</h3>
            <p>Start a billing month to see history here</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Start Reading</th>
                  <th>End Reading</th>
                  <th>Total Units</th>
                  <th>Rate (₹/unit)</th>
                  <th>Active Tenants</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => {
                  const totalUnits = m.end_reading ? m.end_reading - m.start_reading : null;
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.month}</td>
                      <td>{m.start_reading}</td>
                      <td>{m.end_reading || '—'}</td>
                      <td>{totalUnits !== null ? Math.round(totalUnits * 100) / 100 : '—'}</td>
                      <td>₹{m.rate_per_unit}</td>
                      <td>{m.active_tenants}</td>
                      <td>
                        <span className={`badge ${m.is_closed ? 'badge-info' : 'badge-success'}`}>
                          {m.is_closed ? 'Closed' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => navigate(`/month/${m.id}`)}
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>
                          {m.is_closed && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleExport(m.id)}
                              title="Export Excel"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          {currentTenant?.is_admin && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={async () => {
                                const approved = await confirm({
                                  title: 'Delete Billing Month',
                                  message: `Are you sure you want to delete the billing month ${m.month}? This will delete all calculations and events.`,
                                  confirmText: 'Delete',
                                  type: 'danger'
                                });
                                if (!approved) return;

                                try {
                                  await api.deleteMonth(m.id);
                                  showToast(`Billing month ${m.month} deleted successfully!`, 'success');
                                  loadMonths();
                                } catch (e) {
                                  showToast(e.message, 'error');
                                }
                              }}
                              title="Delete Month"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
