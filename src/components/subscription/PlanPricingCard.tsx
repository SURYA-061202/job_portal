import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { useSkin } from '@/styles/skin';
import { formatLimit, formatPrice, isUnlimited } from '@/lib/subscriptions';
import type { SubscriptionAudience, SubscriptionPlan } from '@/types';

interface PlanPricingCardProps {
    plan: SubscriptionPlan;
    audience?: SubscriptionAudience;
    /** Small label next to the name, e.g. "Current". */
    badge?: string;
    /** The call-to-action area under the price: a button, or admin actions. */
    action?: ReactNode;
    /** Small controls pinned to the top right corner (admin edit / delete). */
    corner?: ReactNode;
    /** Replaces the price line (e.g. "Active until ..." on the current plan). */
    priceNode?: ReactNode;
    /** Extra block between the price and the action (usage bars etc.). */
    extra?: ReactNode;
    /** Whether to list the contact-details perk (false on the free plan). */
    includeContact?: boolean;
    /** Things this plan cannot do, listed with a cross (free plan restrictions). */
    restrictions?: string[];
}

/** Pricing card: name, description, price, action, then an "Includes" tick list. */
export default function PlanPricingCard({ plan, audience = 'recruiter', badge, action, corner, priceNode, extra, includeContact = true, restrictions = [] }: PlanPricingCardProps) {
    const skin = useSkin();
    const isUser = audience === 'user';
    const items = [
        ...(plan.maxPosts === 0
            ? []
            : [isUser
                ? isUnlimited(plan.maxPosts) ? 'View unlimited job posts' : `View up to ${formatLimit(plan.maxPosts)} job posts`
                : isUnlimited(plan.maxPosts) ? 'Unlimited job posts' : `${formatLimit(plan.maxPosts)} job posts`]),
        ...(!isUser && includeContact ? ['Candidate contact details & resumes'] : []),
        ...(plan.features ?? []).filter((f) => f.trim()),
    ];

    return (
        <article className={`relative flex h-full flex-col border ${skin.edge} bg-surface ${skin.radius} p-6 transition-all duration-200 hover:border-black hover:shadow-md`}>
            {corner && <div className="absolute right-3 top-3 flex items-center gap-1">{corner}</div>}
            <div className="flex items-center gap-2 pr-16">
                <h4 className="text-2xl font-bold text-ink">{plan.name}</h4>
                {badge && <span className={`${skin.chip} rounded-lg`}>{badge}</span>}
            </div>
            <p className={`mt-3 min-h-[2.75rem] ${skin.body}`}>{plan.description || ' '}</p>

            {priceNode ?? (
                <p className="mt-5 text-3xl font-bold text-ink">
                    {formatPrice(plan.price)}
                    <span className="text-sm font-medium text-ink/60"> / {plan.durationDays} days</span>
                </p>
            )}

            {extra && <div className="mt-4">{extra}</div>}

            {action && <div className="mt-5">{action}</div>}

            <div className={`mt-6 border-t border-ink/10 pt-5`}>
                <p className="mb-3 text-sm font-semibold text-ink">Includes:</p>
                <ul className="space-y-3 text-sm text-ink/80">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink/60" aria-hidden="true" />
                            <span>{item}</span>
                        </li>
                    ))}
                    {restrictions.map((item, i) => (
                        <li key={`x-${i}`} className="flex items-start gap-2.5 text-destructive">
                            <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </article>
    );
}
