"use client";

import { Download, FileUp, KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { shortAddress } from "@/lib/format";
import { CATEGORIES } from "@/lib/metadata";
import { loadProfile, saveProfile, type Profile } from "@/lib/profile";
import { downloadTextFile, listEntries, parseBackup, saveEntries, toBackupJson, type VaultEntry } from "@/lib/salt-vault";

export default function ProfilePage() {
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & Settings" description="Stored only in this browser." />
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
  useEffect(() => setP(loadProfile()), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>Your business name is added to tenders you publish.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(saveProfile(p));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="bn">Business name</Label>
            <Input id="bn" value={p.businessName} onChange={(e) => setP({ ...p, businessName: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat">Main category</Label>
            <Select id="cat" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as Profile["category"] })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="web">Website</Label>
            <Input id="web" type="url" placeholder="https://" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">Save</Button>
            {saved === true && <span className="text-sm text-success">Saved</span>}
            {saved === false && <span className="text-sm text-destructive">Browser storage unavailable</span>}
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
  useEffect(() => setEntries(listEntries()), []);

  async function onImport(file: File) {
    try {
      const imported = parseBackup(await file.text());
      const ok = saveEntries(imported);
      setEntries(listEntries());
      setMsg(ok ? { ok: true, text: `Imported ${imported.length} bid secret(s).` } : { ok: false, text: "Browser storage unavailable." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Import failed" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Bid secrets vault
        </CardTitle>
        <CardDescription>Salts and document keys needed to reveal your sealed bids. Never sent anywhere.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <span>Browser storage can be cleared at any time. Keep the backup files you downloaded when bidding.</span>
        </Alert>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No secrets stored in this browser.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {entries.map((e) => (
              <li key={`${e.contract}-${e.tenderId}-${e.bidder}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>Tender #{e.tenderId}</span>
                <span className="font-mono text-xs text-muted-foreground">{shortAddress(e.bidder)}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleDateString("en-US")}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={entries.length === 0}
            onClick={() => downloadTextFile(`hedgora-vault-${new Date().toISOString().slice(0, 10)}.json`, toBackupJson(entries))}
          >
            <Download /> Export all
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp /> Import backup
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
