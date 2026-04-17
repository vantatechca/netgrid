import { getPostVerifications } from "@/lib/actions/post-verification-actions";
import { requireAdmin } from "@/lib/auth/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PostsPage() {
  await requireAdmin();
  const { records, total } = await getPostVerifications();

  const offSchedule = records.filter((r) => !r.verification.onSchedule).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Post Schedule Verification</h1>
        <p className="text-muted-foreground">Monitor posting compliance across all blogs</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Checks</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">On Schedule</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{records.length - offSchedule}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Off Schedule</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{offSchedule}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Verifications</CardTitle></CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No post verifications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Blog</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Last Post</th>
                    <th className="text-left py-2 font-medium">Days Since</th>
                    <th className="text-left py-2 font-medium">Posts Found</th>
                    <th className="text-left py-2 font-medium">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(({ verification, blogDomain }) => (
                    <tr key={verification.id} className="border-b">
                      <td className="py-2 font-medium">{blogDomain}</td>
                      <td className="py-2">
                        <Badge variant={verification.onSchedule ? "default" : "destructive"}>
                          {verification.onSchedule ? "On Schedule" : "Behind"}
                        </Badge>
                      </td>
                      <td className="py-2 truncate max-w-[200px]">{verification.latestPostTitle || "—"}</td>
                      <td className="py-2">{verification.daysSinceLastPost ?? "—"}</td>
                      <td className="py-2">{verification.postsInPeriod}</td>
                      <td className="py-2">{new Date(verification.checkedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
