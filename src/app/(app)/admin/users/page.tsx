import { type Role, requireUser } from "@/lib/auth";
import { app } from "@/lib/db";
import { updateUser } from "./actions";
import { InviteForm, ResetLoginForm } from "./link-forms";

export default async function UsersPage() {
  const me = await requireUser("owner");
  const users = await app()<{ user_id: string; email: string; role: Role; active: boolean; created_at: Date }[]>`
    select user_id, email, role, active, created_at from kickbuy.app_users order by created_at
  `;
  const recent = await app()<{ at: Date; action: string; email: string | null; detail: Record<string, unknown> }[]>`
    select a.at, a.action, u.email, a.detail
    from kickbuy.user_actions a left join kickbuy.app_users u on u.user_id = a.user_id
    order by a.at desc limit 50
  `;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Users</h1>
        <p className="text-sm text-muted">
          Everyone signs in with a password and an authenticator app. Only people listed here can get in.
        </p>
      </div>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">Invite someone</h2>
        <InviteForm />
      </section>
      <section className="card overflow-x-auto">
        <table className="block w-full text-sm md:table">
          <thead className="hidden border-b border-border text-left text-xs uppercase tracking-wide text-muted md:table-header-group">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role & access</th>
              <th className="px-3 py-2">Login</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {users.map((u) => (
              <tr key={u.user_id} className="block border-b border-border py-2 align-top last:border-0 md:table-row md:py-0">
                <td className="block px-3 py-1 font-medium md:table-cell md:py-2 md:font-normal">
                  {u.email}
                  {u.user_id === me.id && <span className="ml-2 text-xs text-muted">(you)</span>}
                </td>
                <td className="block px-3 py-1 md:table-cell md:py-2">
                  <form action={updateUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={u.user_id} />
                    <select name="role" defaultValue={u.role} className="input w-auto py-1" disabled={u.user_id === me.id}>
                      <option value="owner">owner</option>
                      <option value="buyer">buyer</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.user_id === me.id} />{" "}
                      active
                    </label>
                    {u.user_id !== me.id && <button className="btn btn-secondary py-1 text-xs">Save</button>}
                  </form>
                </td>
                <td className="block px-3 py-1 md:table-cell md:py-2">{u.user_id !== me.id && <ResetLoginForm userId={u.user_id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4 md:overflow-x-auto">
        <h2 className="mb-2 font-medium">Recent activity</h2>
        <table className="block w-full text-xs md:table">
          <tbody className="block md:table-row-group">
            {recent.map((a, i) => (
              <tr key={i} className="flex flex-wrap gap-x-3 border-b border-border py-1.5 last:border-0 md:table-row md:py-0">
                <td className="py-1 whitespace-nowrap text-muted md:pr-3">
                  {a.at.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/London" })}
                </td>
                <td className="py-1 md:pr-3">{a.email ?? "—"}</td>
                <td className="py-1 font-mono md:pr-3">{a.action}</td>
                <td className="w-full py-1 font-mono break-all text-muted md:w-auto">{JSON.stringify(a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
