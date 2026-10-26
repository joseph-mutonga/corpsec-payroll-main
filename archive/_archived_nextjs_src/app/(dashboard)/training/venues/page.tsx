'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Search,
  Building,
  Users,
  CheckCircle2,
  Wrench,
  Phone,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function VenuesPage() {
  const [venues, setVenues] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    name: '',
    branchId: '',
    stationId: '',
    physicalAddress: '',
    capacity: 25,
    contactPerson: '',
    contactPhone: '',
    facilities: '',
    status: 'ACTIVE',
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const [resVenues, resBranches, resStations] = await Promise.all([
        fetch('/api/training/venues'),
        fetch('/api/branches'),
        fetch('/api/stations'),
      ]);
      const jsonVenues = await resVenues.json();
      const jsonBranches = await resBranches.json();
      const jsonStations = await resStations.json();

      if (jsonVenues.success) setVenues(jsonVenues.data.venues || []);
      if (jsonBranches.success) setBranches(jsonBranches.data.branches || []);
      if (jsonStations.success) setStations(jsonStations.data.stations || []);
    } catch (err) {
      console.error('Failed to load venues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVenues();
  }, []);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({
          name: '',
          branchId: '',
          stationId: '',
          physicalAddress: '',
          capacity: 25,
          contactPerson: '',
          contactPhone: '',
          facilities: '',
          status: 'ACTIVE',
        });
        fetchVenues();
      } else {
        alert(json.error || 'Failed to create training venue.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredVenues = venues.filter((v) => {
    if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.physicalAddress?.toLowerCase().includes(q) ||
        v.facilities?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-indigo-600" />
            Training Facilities & Venues
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage certified physical training grounds, lecture halls, and firing range facilities with capacity control
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Venue
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search venue name, address, or equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </Card>

      {/* Venues Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-400">Loading venues...</div>
        ) : filteredVenues.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No training venues found.</div>
        ) : (
          filteredVenues.map((v) => (
            <Card key={v.id} className="p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900">{v.name}</h3>
                  <Badge variant={v.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {v.status}
                  </Badge>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5 font-medium text-indigo-700 bg-indigo-50/70 p-2 rounded-lg">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <span>Max Capacity: {v.capacity} participants</span>
                  </div>

                  {v.physicalAddress && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                      <span>{v.physicalAddress}</span>
                    </div>
                  )}

                  {v.branch && (
                    <div className="flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-gray-400" />
                      <span>Branch: {v.branch.name}</span>
                    </div>
                  )}

                  {v.facilities && (
                    <div className="flex items-start gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                      <span>Facilities: {v.facilities}</span>
                    </div>
                  )}

                  {v.contactPerson && (
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <span>Contact: {v.contactPerson} ({v.contactPhone || 'N/A'})</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span>{v._count?.sessions ?? 0} Sessions Hosted</span>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Venue Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-indigo-600" />
              Register Training Facility / Venue
            </h3>

            <form onSubmit={handleCreateVenue} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Venue Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Upper Hill Academy - Tactical Range A"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Linked Branch</label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Select Branch --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Maximum Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Physical Address</label>
                <input
                  type="text"
                  placeholder="e.g. 4th Floor, CorpSec Plaza, Upper Hill"
                  value={formData.physicalAddress}
                  onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Installed Equipment & Facilities</label>
                <input
                  type="text"
                  placeholder="e.g. HD Projector, First Aid Dummies, Biometric Scanners"
                  value={formData.facilities}
                  onChange={(e) => setFormData({ ...formData, facilities: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Facility Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Registering...' : 'Save Venue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
