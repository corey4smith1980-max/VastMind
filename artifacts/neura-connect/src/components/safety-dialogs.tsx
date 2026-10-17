"use client";
import { useState } from "react";
import { Flag, Loader2, ShieldOff } from "lucide-react";
import { useBlockUser, useReportUser } from "@workspace/api-client-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/format";
import { useInvalidate } from "@/lib/realtime";

type Target = { id: string; name: string } | null;

// ---------- Block confirmation ----------
export function BlockDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const block = useBlockUser({
    mutation: {
      onSuccess: () => {
        invalidate("/api/users", "/api/chats", "/api/feed", "/api/statuses");
        toast({ title: `${target?.name} is blocked`, description: "Undo any time from Settings → Blocked." });
        onClose();
      },
      onError: (e) => toast({ title: "Couldn't block", description: errMessage(e), variant: "destructive" }),
    },
  });
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display flex items-center gap-2"><ShieldOff className="h-5 w-5 text-destructive" /> Block {target?.name}?</AlertDialogTitle>
          <AlertDialogDescription>They won't be able to message you or see your activity. They aren't notified.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); if (target) block.mutate({ userId: target.id }); }}
            data-testid="button-confirm-block"
          >
            {block.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Block
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Report form ----------
export function ReportDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const report = useReportUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report sent", description: "Thanks — our team will review it." });
        setReason("");
        onClose();
      },
      onError: (e) => toast({ title: "Couldn't send report", description: errMessage(e), variant: "destructive" }),
    },
  });
  const valid = reason.trim().length >= 3;
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Flag className="h-5 w-5 text-primary" /> Report {target?.name}</DialogTitle>
          <DialogDescription>Tell us what happened. Reports are private.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={5} placeholder="Spam, harassment, impersonation…" aria-label="Reason" data-testid="input-report-reason" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || report.isPending} onClick={() => target && report.mutate({ userId: target.id, data: { reason: reason.trim() } })} data-testid="button-submit-report">
            {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
