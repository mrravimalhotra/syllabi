-- Phones and browsers that asked to be told when a paper is marked (Web Push). Written and read only by the server.
create table if not exists push_subscriptions (
  endpoint text primary key,
  owner_id uuid not null references students(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_owner on push_subscriptions(owner_id);

alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;
