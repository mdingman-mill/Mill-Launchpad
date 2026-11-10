import React, { useState, useEffect } from 'react';
import { User, OrganizationProfile, OrganizationType, BrandTone, MarketingBudget } from '../types';
import { dataService } from '../services/dataService';
import { Sparkles, Building2, HeartHandshake, Check, AlertCircle, ArrowRight, X, Plus } from 'lucide-react';

interface OnboardingModalProps {
  user: User;
  isOpen: boolean;
  onComplete: (updatedUser: User) => void;
  isEditing?: boolean;
  onCancel?: () => void;
}

const BRAND_TONES: BrandTone[] = ['Warm', 'Bold', 'Professional', 'Playful', 'Inspiring', 'Technical'];

const MARKETING_BUDGETS: MarketingBudget[] = [
  'None',
  'Under $500/month',
  '$500 to $2,000/month',
  'Over $2,000/month',
];

const COMMON_GOALS: Record<OrganizationType, string[]> = {
  Nonprofit: [
    'Expand recurring monthly donor base',
    'Win first competitive government or private grant',
    'Recruit active volunteer network',
    'Increase community workshop attendance',
    'Launch annual signature gala or appeal',
    'Raise local awareness & press coverage',
  ],
  Startup: [
    'Secure first 20 paying customers / pilots',
    'Close Pre-Seed or Seed investment round',
    'Launch on Product Hunt and tech media',
    'Build reliable organic inbound funnel',
    'Establish clear product differentiation',
    'Hire key foundational team members',
  ],
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  isOpen,
  onComplete,
  isEditing = false,
  onCancel,
}) => {
  const existing = user.organizationProfile;

  const [orgName, setOrgName] = useState(existing?.orgName || '');
  const [website, setWebsite] = useState(existing?.website || '');
  const [type, setType] = useState<OrganizationType>(existing?.type || 'Startup');
  const [whatTheyDo, setWhatTheyDo] = useState(existing?.whatTheyDo || '');
  const [targetAudience, setTargetAudience] = useState(existing?.targetAudience || '');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(existing?.goals || []);
  const [customGoal, setCustomGoal] = useState('');
  const [brandTone, setBrandTone] = useState<BrandTone[]>(existing?.brandTone || ['Warm', 'Inspiring']);
  const [budget, setBudget] = useState<MarketingBudget>(existing?.budget || 'Under $500/month');
  const [error, setError] = useState<string | null>(null);

  // Synchronize state whenever modal is opened or user changes
  useEffect(() => {
    if (isOpen) {
      const currentProfile = user.organizationProfile;
      setOrgName(currentProfile?.orgName || '');
      setWebsite(currentProfile?.website || '');
      setType(currentProfile?.type || 'Startup');
      setWhatTheyDo(currentProfile?.whatTheyDo || '');
      setTargetAudience(currentProfile?.targetAudience || '');
      setSelectedGoals(currentProfile?.goals ? [...currentProfile.goals] : []);
      setCustomGoal('');
      setBrandTone(currentProfile?.brandTone ? [...currentProfile.brandTone] : ['Warm', 'Inspiring']);
      setBudget(currentProfile?.budget || 'Under $500/month');
      setError(null);
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const removeGoal = (goalToRemove: string) => {
    setSelectedGoals((prev) => prev.filter((g) => g !== goalToRemove));
    setError(null);
  };

  const toggleGoal = (goal: string) => {
    if (selectedGoals.includes(goal)) {
      setSelectedGoals((prev) => prev.filter((g) => g !== goal));
      setError(null);
    } else {
      if (selectedGoals.length >= 3) {
        setError('You already have 3 goals selected. Click ✕ on a goal to remove it before selecting another.');
        return;
      }
      setError(null);
      setSelectedGoals((prev) => [...prev, goal]);
    }
  };

  const addCustomGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customGoal.trim();
    if (!trimmed) return;
    if (selectedGoals.includes(trimmed)) {
      setError('This goal is already selected.');
      return;
    }
    if (selectedGoals.length >= 3) {
      setError('You already have 3 goals selected. Remove one above (click ✕) to add a new goal.');
      return;
    }
    setSelectedGoals((prev) => [...prev, trimmed]);
    setCustomGoal('');
    setError(null);
  };

  const toggleBrandTone = (tone: BrandTone) => {
    if (brandTone.includes(tone)) {
      // Keep at least 1
      if (brandTone.length <= 1) return;
      setBrandTone(brandTone.filter((t) => t !== tone));
    } else {
      if (brandTone.length >= 2) {
        // Replace second or limit to 2
        setBrandTone([brandTone[0], tone]);
      } else {
        setBrandTone([...brandTone, tone]);
      }
    }
  };

  const handleSave = () => {
    if (!orgName.trim()) {
      setError('Please enter your organization or startup name.');
      return;
    }
    if (!whatTheyDo.trim()) {
      setError('Please provide one or two sentences on what your organization does.');
      return;
    }
    if (!targetAudience.trim()) {
      setError('Please describe who you serve or sell to.');
      return;
    }
    if (selectedGoals.length === 0) {
      setError('Please select at least 1 top goal for the next 6 months.');
      return;
    }
    if (brandTone.length !== 2) {
      setError('Please select exactly 2 brand tones.');
      return;
    }

    const profile: OrganizationProfile = {
      orgName: orgName.trim(),
      website: website.trim() || undefined,
      type,
      whatTheyDo: whatTheyDo.trim(),
      targetAudience: targetAudience.trim(),
      goals: selectedGoals,
      brandTone,
      budget,
    };

    const updated = dataService.updateUser(user.id, {
      organizationProfile: profile,
    });

    if (updated) {
      dataService.logAction('PROFILE_CONFIGURED', `Updated organization profile for ${profile.orgName}`, user.id);
      onComplete(updated);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-rose-950 p-6 text-white relative">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Millennium Agency Guided Onboarding</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-heading">
            {isEditing ? 'Edit Organization Profile' : 'Set Up Your Marketing Foundation'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-lg">
            Every tool in the Launchpad uses this profile to generate hyper-relevant positioning, messaging, and campaigns without asking repetitive questions.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 text-rose-800 text-xs rounded-xl border border-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Organization Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
              1. Organization Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('Nonprofit')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  type === 'Nonprofit'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg ${type === 'Nonprofit' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Nonprofit Organization</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Unlocks Donor Appeal & Grant helpers + 25% discount on paid plans.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('Startup')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  type === 'Startup'
                    ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`p-2 rounded-lg ${type === 'Startup' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Early-Stage Startup</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Unlocks Pitch Deck & Launch helpers designed for growth and fundraising.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Org Name & Website */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={type === 'Nonprofit' ? 'e.g. GreenRoot Foundation' : 'e.g. NexaFlow AI'}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Website (Optional)
              </label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.org"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* What They Do */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              What do you do? (1 or 2 concise sentences) *
            </label>
            <textarea
              rows={2}
              value={whatTheyDo}
              onChange={(e) => setWhatTheyDo(e.target.value)}
              placeholder="e.g. We provide after-school robotics and STEM mentoring for underserved middle school students in Boston."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Who they serve / sell to */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Who do you serve or sell to? *
            </label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. Public school educators, community foundations, and family philanthropic donors."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Top 3 Goals */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                Top 3 Goals for Next 6 Months ({selectedGoals.length}/3 selected) *
              </label>
              <div className="flex items-center gap-2">
                {selectedGoals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGoals([]);
                      setError(null);
                    }}
                    className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <span className="text-[11px] text-slate-500">Pick 1 to 3</span>
              </div>
            </div>

            {/* Currently Selected Goals Cards */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center justify-between">
                <span>Active Selected Goals ({selectedGoals.length} of 3):</span>
                {selectedGoals.length === 3 && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Maximum Reached
                  </span>
                )}
              </div>

              {selectedGoals.length === 0 ? (
                <div className="py-2 text-center text-xs text-amber-800 flex items-center justify-center gap-1.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>No goals selected yet. Pick from the suggestions below or type a custom goal.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selectedGoals.map((goal, index) => (
                    <div
                      key={goal}
                      className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 shadow-xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-semibold text-slate-800 break-words">{goal}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGoal(goal)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition-colors shrink-0"
                        title={`Remove "${goal}"`}
                        aria-label={`Remove goal ${goal}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggestions for current Organization Type */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                Recommended for {type}s (Click to toggle):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_GOALS[type].map((goal) => {
                  const isSelected = selectedGoals.includes(goal);
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => toggleGoal(goal)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-xs font-bold'
                          : selectedGoals.length >= 3
                          ? 'bg-slate-100 text-slate-500 hover:bg-slate-200/70 border border-transparent'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/60 font-medium'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : (
                        <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span>{goal}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Goal Input */}
            <div className="pt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customGoal}
                  onChange={(e) => {
                    setCustomGoal(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    selectedGoals.length >= 3
                      ? '3 goals already selected (remove one above with ✕ to add custom)'
                      : 'Or type a custom 6-month goal...'
                  }
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomGoal(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomGoal}
                  disabled={selectedGoals.length >= 3 || !customGoal.trim()}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors shrink-0"
                >
                  Add Goal
                </button>
              </div>
            </div>
          </div>

          {/* Brand Tone (Pick 2) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                Brand Tone (Pick exactly 2) *
              </label>
              <span className="text-[11px] text-slate-500 font-medium text-rose-600">
                {brandTone.join(' & ')}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BRAND_TONES.map((tone) => {
                const isSelected = brandTone.includes(tone);
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => toggleBrandTone(tone)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all border flex items-center justify-between ${
                      isSelected
                        ? 'border-rose-500 bg-rose-50 text-rose-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{tone}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-rose-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Marketing Budget */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Current Monthly Marketing Budget
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MARKETING_BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBudget(b)}
                  className={`p-2 rounded-lg text-xs font-medium text-center border transition-all ${
                    budget === b
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {isEditing && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
          ) : (
            <div className="text-[11px] text-slate-500">
              You can update these details anytime from Account Settings.
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold tracking-wide shadow-md hover:shadow-lg transition-all"
          >
            <span>{isEditing ? 'Save Changes' : 'Complete Setup & Launch Tools'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
