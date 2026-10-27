"use client";

import { Download, FileUp, KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/components/lang-provider";
import { LangSwitch } from "@/components/lang-switch";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { shortAddress } from "@/lib/format";
import { dateLocale } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/metadata";
import { loadProfile, saveProfile, type Profile } from "@/lib/profile";
import { downloadTextFile, listEntries, parseBackup, saveEntries, toBackupJson, type VaultEntry } from "@/lib/salt-vault";

export default function ProfilePage() {
  const t = useT();
  return (
    <>
      <PageHeader eyebrow={t("Account", "Tài khoản")} title={t("Profile & Settings", "Hồ sơ & Cài đặt")} description={t("Stored only in this browser.", "Chỉ lưu trong trình duyệt này.")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard />
        <VaultCard />
      </div>
    </>
  );
}

function ProfileCard() {
  const [p, setP] = useState<Profile>({ businessName: "", category: "", website: "" });
  const [saved, setSaved] = useState<boolean>();
  const t = useT();
  useEffect(() => setP(loadProfile()), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Business profile", "Hồ sơ doanh nghiệp")}</CardTitle>
        <CardDescription>{t("Your business name is added to tenders you publish.", "Tên doanh nghiệp được thêm vào các gói thầu bạn đăng.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-overlay/[0.07] pb-5">
          <div>
            <p className="text-sm font-medium">{t("Language", "Ngôn ngữ")}</p>
            <p className="text-xs text-muted-foreground">{t("Interface language, kept in this browser.", "Ngôn ngữ giao diện, lưu trong trình duyệt này.")}</p>
          </div>
          <LangSwitch className="w-[96px] shrink-0" />
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(saveProfile(p));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="bn">{t("Business name", "Tên doanh nghiệp")}</Label>
            <Input id="bn" value={p.businessName} onChange={(e) => setP({ ...p, businessName: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat">{t("Main category", "Lĩnh vực chính")}</Label>
            <SelectMenu
              id="cat"
              value={p.category || "none"}
              onValueChange={(v) => setP({ ...p, category: (v === "none" ? "" : v) as Profile["category"] })}
              options={[{ value: "none", label: t("Not set", "Chưa chọn") }, ...CATEGORIES.map((c) => ({ value: c, label: t(CATEGORY_LABEL[c]) }))]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="web">{t("Website", "Trang web")}</Label>
            <Input id="web" type="url" placeholder="https://" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">{t("Save", "Lưu")}</Button>
            {saved === true && <span className="text-sm text-success">{t("Saved", "Đã lưu")}</span>}
            {saved === false && <span className="text-sm text-destructive">{t("Browser storage unavailable", "Không dùng được bộ nhớ trình duyệt")}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VaultCard() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useLang();
  useEffect(() => setEntries(listEntries()), []);

  async function onImport(file: File) {
    try {
      const imported = parseBackup(await file.text());
      const ok = saveEntries(imported);
      setEntries(listEntries());
      setMsg(
        ok
          ? { ok: true, text: t(`Imported ${imported.length} bid secret(s).`, `Đã nhập ${imported.length} bí mật hồ sơ.`) }
          : { ok: false, text: t("Browser storage unavailable.", "Không dùng được bộ nhớ trình duyệt.") },
      );
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("Import failed", "Nhập thất bại") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> {t("Bid secrets vault", "Kho bí mật hồ sơ thầu")}
        </CardTitle>
        <CardDescription>
          {t(
            "Salts and document keys needed to reveal your sealed bids. Never sent anywhere.",
            "Salt và khóa hồ sơ cần để công bố các hồ sơ niêm phong. Không bao giờ được gửi đi đâu.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <span>
            {t(
              "Browser storage can be cleared at any time. Keep the backup files you downloaded when bidding.",
              "Bộ nhớ trình duyệt có thể bị xóa bất cứ lúc nào. Hãy giữ các file sao lưu đã tải khi dự thầu.",
            )}
          </span>
        </Alert>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No secrets stored in this browser.", "Trình duyệt này chưa lưu bí mật nào.")}</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {entries.map((e) => (
              <li key={`${e.contract}-${e.tenderId}-${e.bidder}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {t("Tender", "Gói thầu")} #{e.tenderId}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{shortAddress(e.bidder)}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleDateString(dateLocale(lang))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={entries.length === 0}
            onClick={() => downloadTextFile(`plinths-vault-${new Date().toISOString().slice(0, 10)}.json`, toBackupJson(entries))}
          >
            <Download /> {t("Export all", "Xuất tất cả")}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp /> {t("Import backup", "Nhập file sao lưu")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
