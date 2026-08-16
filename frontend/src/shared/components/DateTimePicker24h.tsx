import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
  ChevronDown
} from 'lucide-react';
import {
  WORKING_HOURS_24H_SLOTS,
  isWeekend,
  isPublicHoliday,
  getHolidayName,
  validateReservationConstraints
} from '../utils/dateValidation';
import { SystemSettings, UserRole } from '@/frontend/src/types';

interface DateTimePicker24hProps {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  settings: SystemSettings;
  userRole?: UserRole;
  onChange: (data: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    businessDays: number;
    requiresExtensionApproval: boolean;
    errorMessage?: string;
  }) => void;
}

export const DateTimePicker24h: React.FC<DateTimePicker24hProps> = ({
  startDate,
  endDate,
  startTime,
  endTime,
  settings,
  userRole,
  onChange,
}) => {
  const [showPresets, setShowPresets] = useState<boolean>(false);

  const validation = validateReservationConstraints(
    startDate,
    endDate || startDate,
    startTime,
    endTime,
    settings,
    userRole
  );

  const handleStartDateChange = (newStart: string) => {
    let newEnd = endDate;
    if (!newEnd || newEnd < newStart) {
      newEnd = newStart;
    }
    const val = validateReservationConstraints(newStart, newEnd, startTime, endTime, settings, userRole);
    onChange({
      startDate: newStart,
      endDate: newEnd,
      startTime,
      endTime,
      businessDays: val.businessDays,
      requiresExtensionApproval: val.requiresExtensionApproval,
      errorMessage: val.errorMessage,
    });
  };

  const handleEndDateChange = (newEnd: string) => {
    const val = validateReservationConstraints(startDate, newEnd, startTime, endTime, settings, userRole);
    onChange({
      startDate,
      endDate: newEnd,
      startTime,
      endTime,
      businessDays: val.businessDays,
      requiresExtensionApproval: val.requiresExtensionApproval,
      errorMessage: val.errorMessage,
    });
  };

  const handleStartTimeChange = (newStartTime: string) => {
    let newEndTime = endTime;
    if (newStartTime >= endTime && startDate === endDate) {
      // Auto-advance endTime by 1 hour if possible
      const idx = WORKING_HOURS_24H_SLOTS.indexOf(newStartTime);
      if (idx >= 0 && idx + 2 < WORKING_HOURS_24H_SLOTS.length) {
        newEndTime = WORKING_HOURS_24H_SLOTS[idx + 2];
      }
    }
    const val = validateReservationConstraints(startDate, endDate || startDate, newStartTime, newEndTime, settings, userRole);
    onChange({
      startDate,
      endDate: endDate || startDate,
      startTime: newStartTime,
      endTime: newEndTime,
      businessDays: val.businessDays,
      requiresExtensionApproval: val.requiresExtensionApproval,
      errorMessage: val.errorMessage,
    });
  };

  const handleEndTimeChange = (newEndTime: string) => {
    const val = validateReservationConstraints(startDate, endDate || startDate, startTime, newEndTime, settings, userRole);
    onChange({
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime: newEndTime,
      businessDays: val.businessDays,
      requiresExtensionApproval: val.requiresExtensionApproval,
      errorMessage: val.errorMessage,
    });
  };

  const applyPreset = (preset: 'morning' | 'afternoon' | 'full_day' | 'two_days') => {
    let sTime = startTime;
    let eTime = endTime;
    let sDate = startDate;
    let eDate = startDate;

    if (preset === 'morning') {
      sTime = '08:00';
      eTime = '12:00';
      eDate = startDate;
    } else if (preset === 'afternoon') {
      sTime = '13:00';
      eTime = '17:00';
      eDate = startDate;
    } else if (preset === 'full_day') {
      sTime = '08:00';
      eTime = '18:00';
      eDate = startDate;
    } else if (preset === 'two_days') {
      sTime = '08:00';
      eTime = '18:00';
      const d = new Date(startDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      // Skip weekend if next day is weekend
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      eDate = d.toISOString().split('T')[0];
    }

    const val = validateReservationConstraints(sDate, eDate, sTime, eTime, settings, userRole);
    onChange({
      startDate: sDate,
      endDate: eDate,
      startTime: sTime,
      endTime: eTime,
      businessDays: val.businessDays,
      requiresExtensionApproval: val.requiresExtensionApproval,
      errorMessage: val.errorMessage,
    });
    setShowPresets(false);
  };

  const startHolidayName = getHolidayName(startDate, settings.holidays);
  const startIsWeekend = isWeekend(startDate);

  return (
    <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
      {/* Header & Presets Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <CalendarIcon className="w-4 h-4 text-[#008751]" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Planification 24H (08:00 - 18:00)
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 overflow-x-auto text-[11px]">
          <button
            type="button"
            onClick={() => applyPreset('morning')}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 transition-colors border border-emerald-200/60"
          >
            Matin (08h-12h)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('afternoon')}
            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-semibold hover:bg-blue-100 transition-colors border border-blue-200/60"
          >
            Après-midi (13h-17h)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('full_day')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200/60"
          >
            Journée (08h-18h)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('two_days')}
            className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 font-semibold hover:bg-purple-100 transition-colors border border-purple-200/60"
          >
            2 Jours Ouvrés
          </button>
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Date Début */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            Date de début
          </label>
          <div className="relative">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border ${
                startIsWeekend || startHolidayName
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-slate-300 bg-slate-50 text-slate-800'
              } focus:ring-2 focus:ring-[#008751] outline-none transition-all`}
            />
          </div>
          {startIsWeekend && (
            <span className="text-[10px] text-red-600 font-bold block">Week-end interdit</span>
          )}
          {startHolidayName && (
            <span className="text-[10px] text-amber-600 font-bold block">Férié : {startHolidayName}</span>
          )}
        </div>

        {/* Date Fin */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 block">
            Date de fin
          </label>
          <input
            type="date"
            min={startDate}
            value={endDate || startDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-[#008751] outline-none transition-all"
          />
        </div>

        {/* Heure Début (24h Dropdown) */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#008751]" />
            <span>Heure début (24h)</span>
          </label>
          <div className="relative">
            <select
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-[#008751] outline-none appearance-none cursor-pointer pr-8"
            >
              {WORKING_HOURS_24H_SLOTS.slice(0, -1).map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Heure Fin (24h Dropdown) */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#008751]" />
            <span>Heure fin (24h)</span>
          </label>
          <div className="relative">
            <select
              value={endTime}
              onChange={(e) => handleEndTimeChange(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-[#008751] outline-none appearance-none cursor-pointer pr-8"
            >
              {WORKING_HOURS_24H_SLOTS.slice(1).map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Validation Feedback & Business Days Calculator Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center space-x-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm ${
              validation.requiresExtensionApproval
                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                : validation.valid
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-red-100 text-red-900 border border-red-300'
            }`}
          >
            {validation.requiresExtensionApproval ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                <span>{validation.businessDays} jours ouvrés (Validation requise &gt; 2j)</span>
              </>
            ) : validation.valid ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {validation.businessDays} jour{validation.businessDays > 1 ? 's' : ''} ouvré{validation.businessDays > 1 ? 's' : ''} (Accord direct)
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>Non valide</span>
              </>
            )}
          </span>
        </div>

        {/* Error message banner */}
        {!validation.valid && validation.errorMessage && (
          <div className="w-full text-xs font-bold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{validation.errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};