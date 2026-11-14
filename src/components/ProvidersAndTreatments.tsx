import React from 'react';
import { DENTAL_PROCEDURES, DENTAL_PROVIDERS } from '../shared/clinicData';

interface ProvidersViewProps {
  onBookWithProvider: (providerId: string) => void;
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({ onBookWithProvider }) => {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Clinical Providers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Practitioners, operatories, and scheduling lanes connected to the voice reception pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {DENTAL_PROVIDERS.map((provider) => (
          <article
            key={provider.id}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
          >
            <div className="aspect-square w-full bg-slate-100 overflow-hidden border-b border-slate-200">
              <img
                src={provider.avatarUrl}
                alt={`${provider.name}, ${provider.credentials}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs font-medium text-teal-700">{provider.operatory}</div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {provider.name}, {provider.credentials}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{provider.specialty}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Clinic Hours · Mon–Sat 08:30 – 17:30
                </div>
              </div>
              <button
                type="button"
                onClick={() => onBookWithProvider(provider.id)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
              >
                Schedule with {provider.name.split(' ').slice(-1)[0]}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

interface TreatmentsViewProps {
  onBookProcedure: (providerId: string) => void;
}

export const TreatmentsView: React.FC<TreatmentsViewProps> = ({ onBookProcedure }) => {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Treatment Catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Standard durations and fee schedules used by Gemini Live to reserve accurate chair time.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-5">Procedure</th>
                <th className="py-3 px-5">Category</th>
                <th className="py-3 px-5">Default Provider</th>
                <th className="py-3 px-5 text-right">Duration</th>
                <th className="py-3 px-5 text-right">Est. Fee</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {DENTAL_PROCEDURES.map((proc) => {
                const defaultProv = DENTAL_PROVIDERS.find((p) => p.id === proc.defaultProviderId);
                return (
                  <tr key={proc.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <div className="font-medium text-slate-900">{proc.name}</div>
                      <div className="text-xs text-slate-500">{proc.description}</div>
                    </td>
                    <td className="py-3.5 px-5 text-slate-600 whitespace-nowrap">
                      {proc.category}
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 whitespace-nowrap">
                      {defaultProv?.name ?? 'Any'}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-xs text-slate-800 text-right tabular-nums whitespace-nowrap">
                      {proc.durationMinutes} min
                    </td>
                    <td className="py-3.5 px-5 font-mono text-xs font-medium text-slate-900 text-right tabular-nums whitespace-nowrap">
                      ${proc.feeUsd}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onBookProcedure(proc.defaultProviderId)}
                        className="text-xs font-medium text-teal-700 hover:underline"
                      >
                        Book Slot
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
