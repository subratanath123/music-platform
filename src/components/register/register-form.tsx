"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Globe,
  Lock,
  Music,
  Pencil,
  Plus,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DefaultCoverArt } from "@/components/profile/default-cover-art";
import { UserAvatar } from "@/components/profile/user-avatar";
import { Button } from "@/components/ui/button";
import type { Role } from "@/data/catalog";
import { useRouter } from "@/i18n/navigation";
import {
  mutateCommunity,
  setSessionUser,
  uploadAudioFile,
  useCommunityStore,
  useCurrentUser,
} from "@/lib/community-store";
import type { DbUser } from "@/lib/db-types";
import { formatNumber } from "@/lib/format";
import {
  GENRE_SUGGESTIONS,
  INSTRUMENT_SUGGESTIONS,
  PROFILE_BIO_MAX,
  PROFILE_BIO_MIN,
} from "@/lib/profile-rules";
import { youtubeIdFromUrl } from "@/lib/youtube";

const roles: Role[] = ["vocalist", "guitarist", "percussion", "flute", "producer", "lyricist"];
const steps = ["basics", "skills", "photos", "showcase", "review"] as const;
type Step = (typeof steps)[number];
type Errors = Partial<Record<string, string>>;

const inputClass =
  "h-11 w-full rounded-2xl border bg-black/60 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

function borderFor(error?: string) {
  return error ? "border-destructive/70" : "border-white/10";
}

export function RegisterForm() {
  const t = useTranslations("Register");
  const locale = useLocale();
  const { hydrated, db } = useCommunityStore();
  const currentUser = useCurrentUser();

  const ssoError =
    hydrated && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sso_error")
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-28 sm:px-5">
      <h1 className="font-display text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("lead")}</p>

      <section className="mt-6 rounded-3xl border border-white/10 bg-[#161616] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={
                currentUser
                  ? "grid size-9 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"
                  : "grid size-9 place-items-center rounded-full bg-white text-sm font-bold text-black"
              }
            >
              {currentUser ? <Check className="size-4" /> : "1"}
            </span>
            <div>
              <h2 className="text-sm font-semibold">{t("googleStepTitle")}</h2>
              <p className="text-xs text-muted-foreground">
                {currentUser
                  ? `${t("signedInAs")} ${currentUser.email ?? currentUser.name}`
                  : t("googleStepSub")}
              </p>
            </div>
          </div>
          {currentUser ? (
            <button
              type="button"
              onClick={() => setSessionUser(null)}
              className="text-xs text-muted-foreground underline decoration-primary underline-offset-4 hover:text-foreground"
            >
              {t("switchAccount")}
            </button>
          ) : (
            <Button asChild className="rounded-full">
              <a href={`/api/auth/google?locale=${locale}`}>{t("continueWithGoogle")}</a>
            </Button>
          )}
        </div>
        {ssoError && !currentUser ? (
          <p role="alert" className="mt-3 text-xs font-medium text-destructive">
            {ssoError === "gmail_only"
              ? t("googleEmailRequired")
              : ssoError === "access_denied"
                ? t("ssoAccessDenied")
                : ssoError === "state_mismatch"
                  ? t("ssoStateMismatch")
                  : `${t("ssoFailed")} (${ssoError})`}
          </p>
        ) : null}
      </section>

      {!hydrated ? (
        <div className="mt-6 h-96 animate-pulse rounded-3xl border border-white/10 bg-[#161616]" />
      ) : currentUser ? (
        <ProfileWizard
          key={currentUser.id}
          user={currentUser}
          existingShowcaseCount={db.collections.filter((c) => c.musicianId === currentUser.id).length}
        />
      ) : (
        <section className="mt-6 flex items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-[#121212] p-6 text-sm text-muted-foreground">
          <Lock className="size-5 shrink-0" />
          {t("lockedStep2")}
        </section>
      )}
    </div>
  );
}

function ProfileWizard({
  user,
  existingShowcaseCount,
}: {
  user: DbUser;
  existingShowcaseCount: number;
}) {
  const t = useTranslations("Register");
  const home = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(user.profileCompleted ? steps.length - 1 : 0);
  const [showErrors, setShowErrors] = useState(false);

  const [role, setRole] = useState<Role>(user.roles[0] ?? "vocalist");
  const [name, setName] = useState(user.name ?? "");
  const [city, setCity] = useState(user.profileCompleted ? user.city : "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [instruments, setInstruments] = useState<string[]>(
    user.profileCompleted ? user.instruments : [],
  );
  const [genres, setGenres] = useState<string[]>(user.profileCompleted ? user.genres : []);
  const [price, setPrice] = useState(user.priceFromBdt ? String(user.priceFromBdt) : "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [bkashNumber, setBkashNumber] = useState(user.bkashNumber ?? "");
  const [isPrivate, setIsPrivate] = useState(Boolean(user.isPrivate));
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(user.coverUrl ?? "");
  const [youtube, setYoutube] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioTitle, setAudioTitle] = useState("");
  const [uploadingField, setUploadingField] = useState<"avatar" | "cover" | "audio" | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const step: Step = steps[stepIndex];
  const youtubeId = youtubeIdFromUrl(youtube);
  const priceNumber = Number(price.replace(/[^\d]/g, ""));

  function validate(target: Step): Errors {
    const e: Errors = {};
    if (target === "basics") {
      if (!name.trim()) e.name = t("errName");
      if (!city.trim()) e.city = t("errCity");
      if (bio.trim().length < PROFILE_BIO_MIN) e.bio = t("errBio", { min: PROFILE_BIO_MIN });
    }
    if (target === "skills") {
      if (instruments.length === 0) e.instruments = t("errInstruments");
      if (genres.length === 0) e.genres = t("errGenres");
      if (!(priceNumber > 0)) e.price = t("errPrice");
    }
    if (target === "photos") {
      if (!avatarUrl) e.avatar = t("errAvatar");
    }
    if (target === "showcase") {
      if (youtube.trim() && !youtubeId) e.youtube = t("badLink");
      if (youtubeId && !youtubeTitle.trim()) e.youtubeTitle = t("errShowcaseTitle");
      if (audioUrl && !audioTitle.trim()) e.audioTitle = t("errShowcaseTitle");
      if (!youtubeId && !audioUrl && existingShowcaseCount === 0) e.showcase = t("errShowcase");
    }
    return e;
  }

  const errors = showErrors ? validate(step) : {};
  const firstInvalid = steps.findIndex((s) => Object.keys(validate(s)).length > 0);

  function goTo(index: number) {
    setShowErrors(false);
    setSubmitError("");
    setStepIndex(index);
    setMaxReached((m) => Math.max(m, index));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (Object.keys(validate(step)).length > 0) {
      setShowErrors(true);
      return;
    }
    goTo(stepIndex + 1);
  }

  async function upload(file: File | undefined, field: "avatar" | "cover" | "audio") {
    if (!file) return;
    setUploadingField(field);
    setSubmitError("");
    try {
      const up = await uploadAudioFile(file);
      if (field === "avatar") setAvatarUrl(up.url);
      if (field === "cover") setCoverUrl(up.url);
      if (field === "audio") {
        setAudioUrl(up.url);
        if (!audioTitle.trim()) setAudioTitle(up.name.replace(/\.[^.]+$/, ""));
      }
    } catch {
      setSubmitError(t("uploadFailed"));
    } finally {
      setUploadingField(null);
    }
  }

  async function publish() {
    if (firstInvalid !== -1 && firstInvalid < steps.length - 1) {
      goTo(firstInvalid);
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      const res = await mutateCommunity<{ error?: string }>({
        action: "completeProfile",
        userId: user.id,
        name: name.trim(),
        city: city.trim(),
        role,
        bio: bio.trim(),
        instruments: instruments.join(", "),
        genres: genres.join(", "),
        price: String(priceNumber),
        phone: phone.trim(),
        bkashNumber: bkashNumber.trim(),
        isPrivate,
        avatarUrl: avatarUrl || undefined,
        coverUrl: coverUrl || undefined,
        youtubeId: youtubeId || undefined,
        youtubeTitle: youtubeTitle.trim() || undefined,
        audioSrc: audioUrl || undefined,
        audioTitle: audioTitle.trim() || undefined,
      });
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      router.push(`/u/${user.id}`);
    } catch {
      setSubmitError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#161616]">
      <div className="border-b border-white/10 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("step2Title")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("stepOf", {
              current: formatNumber(stepIndex + 1, locale),
              total: formatNumber(steps.length, locale),
            })}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ff5500] to-[#ffaa33] transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-1.5">
          {steps.map((s, i) => {
            const blockedFrom = firstInvalid === -1 ? steps.length : firstInvalid;
            const done =
              i !== stepIndex &&
              i < steps.length - 1 &&
              i <= maxReached &&
              i < blockedFrom &&
              Object.keys(validate(s)).length === 0;
            const reachable = i <= stepIndex || (i <= maxReached && i <= blockedFrom);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goTo(i)}
                  aria-current={i === stepIndex ? "step" : undefined}
                  className="group flex w-full flex-col items-center gap-1.5 disabled:cursor-not-allowed"
                >
                  <span
                    className={
                      i === stepIndex
                        ? "grid size-8 place-items-center rounded-full bg-gradient-to-r from-[#ff5500] to-[#ffaa33] text-xs font-bold text-[#1a0900]"
                        : done
                          ? "grid size-8 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"
                          : "grid size-8 place-items-center rounded-full border border-white/15 text-xs text-muted-foreground"
                    }
                  >
                    {done && i !== stepIndex ? <Check className="size-4" /> : formatNumber(i + 1, locale)}
                  </span>
                  <span
                    className={
                      i === stepIndex
                        ? "text-center text-[11px] font-semibold text-foreground sm:text-xs"
                        : "text-center text-[11px] text-muted-foreground sm:text-xs"
                    }
                  >
                    {t(`step_${s}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="px-5 py-6">
        <h3 className="font-display text-2xl">{t(`step_${step}_title`)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t(`step_${step}_sub`)}</p>

        <div className="mt-6 space-y-5">
          {step === "basics" ? (
            <>
              <Field label={t("role")} required>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
                  {roles.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="radio"
                      aria-checked={role === item}
                      onClick={() => setRole(item)}
                      className={
                        role === item
                          ? "flex items-center justify-between rounded-2xl border border-primary bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground"
                          : "flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-muted-foreground hover:border-white/25 hover:text-foreground"
                      }
                    >
                      {home(`roles.${item}`)}
                      {role === item ? <CheckCircle2 className="size-4 text-primary" /> : null}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("name")} required error={errors.name} htmlFor="reg-name">
                  <input
                    id="reg-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                    className={`${inputClass} ${borderFor(errors.name)}`}
                  />
                </Field>
                <Field label={t("city")} required error={errors.city} htmlFor="reg-city">
                  <input
                    id="reg-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t("cityPlaceholder")}
                    className={`${inputClass} ${borderFor(errors.city)}`}
                  />
                </Field>
              </div>
              <Field
                label={t("bio")}
                required
                error={errors.bio}
                htmlFor="reg-bio"
                hint={t("bioCount", {
                  count: formatNumber(bio.trim().length, locale),
                  min: formatNumber(PROFILE_BIO_MIN, locale),
                })}
              >
                <textarea
                  id="reg-bio"
                  value={bio}
                  maxLength={PROFILE_BIO_MAX}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder={t("bioPlaceholder")}
                  className={`${inputClass} h-auto py-3 leading-6 ${borderFor(errors.bio)}`}
                />
              </Field>
              <Field
                label={locale === "bn" ? "প্রোফাইল ভিজিবিলিটি" : "Profile Visibility"}
                hint={
                  locale === "bn"
                    ? "প্রাইভেট রাখলে তোমার প্রোফাইল ডিরেক্টরি ও সার্চে দেখাবে না"
                    : "Private profiles are hidden from the Musicians Directory and search"
                }
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isPrivate}
                    onClick={() => setIsPrivate(false)}
                    className={
                      !isPrivate
                        ? "flex items-center justify-between rounded-2xl border border-primary bg-primary/10 px-4 py-3 text-left text-sm font-semibold text-foreground"
                        : "flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-left text-sm text-muted-foreground hover:border-white/25 hover:text-foreground"
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <Globe className="size-4 text-primary" />
                      <span>{locale === "bn" ? "পাবলিক প্রোফাইল" : "Public Profile"}</span>
                    </span>
                    {!isPrivate ? <CheckCircle2 className="size-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isPrivate}
                    onClick={() => setIsPrivate(true)}
                    className={
                      isPrivate
                        ? "flex items-center justify-between rounded-2xl border border-primary bg-primary/10 px-4 py-3 text-left text-sm font-semibold text-foreground"
                        : "flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-left text-sm text-muted-foreground hover:border-white/25 hover:text-foreground"
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <Lock className="size-4 text-primary" />
                      <span>{locale === "bn" ? "প্রাইভেট প্রোফাইল" : "Private Profile"}</span>
                    </span>
                    {isPrivate ? <CheckCircle2 className="size-4 text-primary" /> : null}
                  </button>
                </div>
              </Field>
            </>
          ) : null}

          {step === "skills" ? (
            <>
              <Field label={t("instruments")} required error={errors.instruments} hint={t("chipHint")}>
                <ChipInput
                  id="reg-instruments"
                  values={instruments}
                  onChange={setInstruments}
                  suggestions={INSTRUMENT_SUGGESTIONS[role]}
                  placeholder={t("instrumentsPlaceholder")}
                  invalid={Boolean(errors.instruments)}
                />
              </Field>
              <Field label={t("genres")} required error={errors.genres} hint={t("chipHint")}>
                <ChipInput
                  id="reg-genres"
                  values={genres}
                  onChange={setGenres}
                  suggestions={GENRE_SUGGESTIONS}
                  placeholder={t("genresPlaceholder")}
                  invalid={Boolean(errors.genres)}
                />
              </Field>
              <Field label={t("price")} required error={errors.price} htmlFor="reg-price" hint={t("priceHint")}>
                <div className="relative sm:max-w-xs">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground">
                    ৳
                  </span>
                  <input
                    id="reg-price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d০-৯]/g, ""))}
                    inputMode="numeric"
                    placeholder="3000"
                    className={`${inputClass} pl-9 ${borderFor(errors.price)}`}
                  />
                </div>
              </Field>
              <div className="grid gap-5 rounded-2xl border border-white/10 bg-black/40 p-4 sm:grid-cols-2">
                <Field
                  label={locale === "bn" ? "ফোন নম্বর (ঐচ্ছিক)" : "Phone Number (Optional)"}
                  htmlFor="reg-phone"
                  hint={
                    locale === "bn"
                      ? "অর্ডার বা সেশন সমন্বয়ের জন্য যোগাযোগের নম্বর"
                      : "Shown to clients when coordinating an order"
                  }
                >
                  <input
                    id="reg-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="017XXXXXXXX"
                    className={`${inputClass} border-white/10`}
                  />
                </Field>
                <Field
                  label={locale === "bn" ? "বিকাশ নম্বর (ঐচ্ছিক)" : "bKash Number (Optional)"}
                  htmlFor="reg-bkash"
                  hint={
                    locale === "bn"
                      ? "অর্ডার প্লেস করার সময় ক্রেতা এই বিকাশ নম্বরে পেমেন্ট পাঠাতে পারবে"
                      : "Displayed during Place Order so buyers can send bKash payment to you"
                  }
                >
                  <input
                    id="reg-bkash"
                    value={bkashNumber}
                    onChange={(e) => setBkashNumber(e.target.value)}
                    inputMode="tel"
                    placeholder="017XXXXXXXX (bKash Personal / Merchant)"
                    className={`${inputClass} border-white/10`}
                  />
                </Field>
              </div>
            </>
          ) : null}

          {step === "photos" ? (
            <>
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/60">
                <div className="relative h-40 sm:h-48">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <DefaultCoverArt seed={name || user.id} role={role} />
                  )}
                  <label className="absolute top-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-2 text-xs font-medium backdrop-blur hover:bg-black/85">
                    <Camera className="size-3.5 text-primary" />
                    {uploadingField === "cover" ? t("uploading") : t("coverPhotoLabel")}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => void upload(e.target.files?.[0], "cover")}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <UserAvatar
                    src={avatarUrl}
                    name={name || user.name}
                    className={`size-20 ring-4 ${errors.avatar ? "ring-destructive/70" : "ring-[#161616]"}`}
                    textClassName="text-2xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{name || user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {home(`roles.${role}`)} · {city}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs font-medium hover:border-primary">
                    <Camera className="size-3.5 text-primary" />
                    {uploadingField === "avatar" ? t("uploading") : t("profilePhotoLabel")}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => void upload(e.target.files?.[0], "avatar")}
                    />
                  </label>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">{t("profilePhotoLabel")}</span> ·{" "}
                  {t("required")} — {t("avatarHint")}
                </li>
                <li>
                  <span className="font-medium text-foreground">{t("coverPhotoLabel")}</span> ·{" "}
                  {t("optional")} — {t("coverHint")}
                </li>
              </ul>
              {errors.avatar ? <p className="text-sm text-destructive">{errors.avatar}</p> : null}
            </>
          ) : null}

          {step === "showcase" ? (
            <>
              {existingShowcaseCount > 0 ? (
                <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  {t("existingShowcase", { count: formatNumber(existingShowcaseCount, locale) })}
                </p>
              ) : null}

              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Video className="size-4 text-primary" />
                  {t("youtubeCardTitle")}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
                  <div className="space-y-4">
                    <Field label={t("youtube")} error={errors.youtube} htmlFor="reg-youtube">
                      <input
                        id="reg-youtube"
                        value={youtube}
                        onChange={(e) => setYoutube(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=…"
                        className={`${inputClass} ${borderFor(errors.youtube)}`}
                      />
                    </Field>
                    <Field label={t("youtubeTitleLabel")} error={errors.youtubeTitle} htmlFor="reg-youtube-title">
                      <input
                        id="reg-youtube-title"
                        value={youtubeTitle}
                        onChange={(e) => setYoutubeTitle(e.target.value)}
                        placeholder={t("youtubeTitlePlaceholder")}
                        className={`${inputClass} ${borderFor(errors.youtubeTitle)}`}
                      />
                    </Field>
                  </div>
                  <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black text-xs text-muted-foreground sm:aspect-auto">
                    {youtubeId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      t("previewHere")
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-white/10" />
                {t("andOr")}
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Music className="size-4 text-primary" />
                  {t("audioCardTitle")}
                </p>
                <div className="mt-4 space-y-4">
                  {audioUrl ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/60 p-3">
                      <audio controls src={audioUrl} className="h-10 min-w-0 flex-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setAudioUrl("");
                          setAudioTitle("");
                        }}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        aria-label={t("removeAudio")}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 py-6 text-center text-sm text-muted-foreground hover:border-primary hover:text-foreground">
                      <Upload className="size-5 text-primary" />
                      {uploadingField === "audio" ? t("uploading") : t("chooseAudio")}
                      <span className="text-xs">{t("audioFormats")}</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        onChange={(e) => void upload(e.target.files?.[0], "audio")}
                      />
                    </label>
                  )}
                  {audioUrl ? (
                    <Field label={t("audioTitleLabel")} error={errors.audioTitle} htmlFor="reg-audio-title">
                      <input
                        id="reg-audio-title"
                        value={audioTitle}
                        onChange={(e) => setAudioTitle(e.target.value)}
                        placeholder={t("audioTitlePlaceholder")}
                        className={`${inputClass} ${borderFor(errors.audioTitle)}`}
                      />
                    </Field>
                  ) : null}
                </div>
              </div>
              {errors.showcase ? <p className="text-sm text-destructive">{errors.showcase}</p> : null}
            </>
          ) : null}

          {step === "review" ? (
            <div className="divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
              <ReviewRow title={t("step_basics")} onEdit={() => goTo(0)}>
                <p className="font-medium text-foreground">
                  {name} · {home(`roles.${role}`)} · {city} ·{" "}
                  {isPrivate
                    ? locale === "bn"
                      ? "🔒 প্রাইভেট"
                      : "🔒 Private"
                    : locale === "bn"
                      ? "🌐 পাবলিক"
                      : "🌐 Public"}
                </p>
                <p className="mt-1 line-clamp-3">{bio}</p>
              </ReviewRow>
              <ReviewRow title={t("step_skills")} onEdit={() => goTo(1)}>
                <p>{instruments.join(", ")}</p>
                <p className="mt-1">{genres.join(", ")}</p>
                <p className="mt-1 font-medium text-foreground">
                  {t("priceFrom", { price: formatNumber(priceNumber, locale) })}
                </p>
                {phone.trim() || bkashNumber.trim() ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {phone.trim() ? `Phone: ${phone.trim()}` : ""}
                    {phone.trim() && bkashNumber.trim() ? " · " : ""}
                    {bkashNumber.trim() ? `bKash: ${bkashNumber.trim()}` : ""}
                  </p>
                ) : null}
              </ReviewRow>
              <ReviewRow title={t("step_photos")} onEdit={() => goTo(2)}>
                <div className="flex items-center gap-3">
                  <UserAvatar src={avatarUrl} name={name} className="size-10" textClassName="text-sm" />
                  <span>{coverUrl ? t("coverUploaded") : t("coverDefault")}</span>
                </div>
              </ReviewRow>
              <ReviewRow title={t("step_showcase")} onEdit={() => goTo(3)}>
                <ul className="space-y-1">
                  {youtubeId ? (
                    <li className="flex items-center gap-2">
                      <Video className="size-3.5 text-primary" />
                      {youtubeTitle}
                    </li>
                  ) : null}
                  {audioUrl ? (
                    <li className="flex items-center gap-2">
                      <Music className="size-3.5 text-primary" />
                      {audioTitle}
                    </li>
                  ) : null}
                  {existingShowcaseCount > 0 ? (
                    <li>{t("existingShowcase", { count: formatNumber(existingShowcaseCount, locale) })}</li>
                  ) : null}
                </ul>
              </ReviewRow>
            </div>
          ) : null}
        </div>

        {submitError ? (
          <p role="alert" className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-5 py-4">
        {stepIndex > 0 ? (
          <Button type="button" variant="secondary" className="rounded-full" onClick={() => goTo(stepIndex - 1)}>
            <ArrowLeft className="size-4" />
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {step === "review" ? (
          <Button type="button" className="rounded-full px-6" disabled={saving} onClick={() => void publish()}>
            {saving ? t("saving") : user.profileCompleted ? t("saveChanges") : t("publish")}
          </Button>
        ) : (
          <Button type="button" className="rounded-full px-6" disabled={uploadingField !== null} onClick={next}>
            {t("next")}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-1 text-sm font-medium">
        {label}
        {required ? <span className="text-primary">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ChipInput({
  id,
  values,
  onChange,
  suggestions,
  placeholder,
  invalid,
}: {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());

  function add(raw: string) {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !has(s));
    if (items.length > 0) onChange([...values, ...items].slice(0, 12));
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  const remaining = suggestions.filter((s) => !has(s));

  return (
    <div>
      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border bg-black/60 px-2 py-1.5 focus-within:border-primary ${invalid ? "border-destructive/70" : "border-white/10"}`}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-primary/15 py-1 pr-1 pl-3 text-xs font-medium text-foreground"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="grid size-5 place-items-center rounded-full hover:bg-white/15"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length === 0 ? placeholder : ""}
          className="h-8 min-w-32 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {remaining.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("Register");
  return (
    <div className="flex gap-4 px-5 py-4 text-sm text-muted-foreground">
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">{title}</p>
        {children}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 text-xs hover:border-primary hover:text-foreground"
      >
        <Pencil className="size-3" />
        {t("edit")}
      </button>
    </div>
  );
}
