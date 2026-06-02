### Added ordinal to messages

conditional for now but multiple queries ran against the db indicate everything is in perfect shape post-backfill

```sql
select
	"conversationId",
	COUNT(*) as msg_count,
	MIN("ordinal") as min_ord,
	MAX("ordinal") as max_ord,
	COUNT(distinct "ordinal") as distinct_ords
from
	"Message"
group by
	"conversationId"
having
	MIN("ordinal") <> 0
	or MAX("ordinal") <> COUNT(*) - 1
	or COUNT(distinct "ordinal") <> COUNT(*)
order by
	"conversationId";

select
	"conversationId",
	COUNT(*) as unnumbered
from
	"Message"
where
	"ordinal" is null
group by
	"conversationId"
order by
	unnumbered desc;

select
	"conversationId",
	"id",
	"ordinal",
	"createdAt",
	prev_created
from
	(
	select
		"conversationId",
		"id",
		"ordinal",
		"createdAt",
		lag("createdAt") over (partition by "conversationId"
	order by
		"ordinal") as prev_created
	from
		"Message"
) t
where
	prev_created is not null
	and "createdAt" < prev_created
order by
	"conversationId",
	"ordinal";

```

all of these returned empty which is perfect

--- 

additional test to view a specific message indicates we're good to go

```sql
select
	m.id,
	m."createdAt",
	m.ordinal
from
	"Message" as m
where
	m."conversationId" = 'b7yqfw98t7va4y5uiowsd8hk'
order by
	m.ordinal;
```

returns 

```txt
+------------------------+-----------------------+-------+
|id                      |createdAt              |ordinal|
+------------------------+-----------------------+-------+
|vm8x7vp6roxavdj6kyxi7ay2|2025-11-14 12:42:24.211|      0|
|elbplet56u98ysvl8ss4lsnx|2025-11-14 12:42:51.662|      1|
|ud7zq8fme1kl32nfw7as86pn|2025-11-14 12:43:51.032|      2|
|k5u2d8xr2xb48sm3iigcwnvd|2025-11-14 12:44:17.065|      3|
|np7s23xw6s9mayi3m4ok4kbf|2025-11-14 12:47:35.290|      4|
|jkghe1c5hhd2l6gb87dun22x|2025-11-14 12:47:56.860|      5|
|gqmoo2muagsk1diftgli1e5e|2025-11-14 12:48:36.984|      6|
|d47yw38bsbyci2hq74hdldf2|2025-11-14 12:49:01.326|      7|
|qe1i6npeeooxjgq4vq88lh2m|2025-11-14 12:51:40.645|      8|
|gwlavb9xnqdr217tedipnsfa|2025-11-14 12:51:46.740|      9|
|dttxknieas866jal3rl5razp|2025-11-15 11:32:59.872|     10|
|u1499saeuic5jweyv0jwc0a1|2025-11-15 11:33:25.553|     11|
|ozh0dptjc48ky4ekne8fxwm1|2025-11-15 11:35:42.682|     12|
|vd6iih0ejvfm3sh7xlifsp8n|2025-11-15 11:36:07.177|     13|
|o4loom9n3n8gh0j46zf1sr8s|2025-11-15 11:39:41.053|     14|
|d754y5as1ymwwxvqd8q8psdl|2025-11-15 11:39:46.360|     15|
|oloooxxynwnzcvddxyx4dy2g|2025-11-15 11:40:32.481|     16|
|nco82mky3t6tazy7ey9rtn6w|2025-11-15 11:40:52.083|     17|
|g10dusv064vbft4ahktet6u8|2025-11-15 11:43:20.863|     18|
|ks4srzr1ej08fh45pgpkclpk|2025-11-15 11:43:46.663|     19|
|y8btan8i3e2bgyvqa0cv109p|2025-11-15 11:57:23.290|     20|
|vnx16o6zmsjj5xvae0c7psy6|2025-11-15 11:58:53.857|     21|
|wpfmwwq79xknhbda9ghp7iza|2025-11-15 12:17:00.884|     22|
|o3etm13bjlbulkcknmqf07wl|2025-11-15 12:18:39.684|     23|
|b5zrfe1qq0j2zlxhea785re8|2025-11-15 12:27:59.105|     24|
|zc3hg2kdrlzo0gkz9dx9hmb1|2025-11-15 12:29:25.978|     25|
|owa1cpruq8jnyetfbyt0fbuv|2025-11-15 12:32:22.805|     26|
|btg83n1n1lu5q490s5yzalif|2025-11-15 12:33:44.892|     27|
|k14mo535twkkmess0w095g0k|2025-11-15 12:36:56.208|     28|
|u121bym5umdni4uzwh5wbkv2|2025-11-15 12:38:16.159|     29|
|a14jxtp169e6yed6yer7azge|2025-11-15 22:36:35.882|     30|
|pjnewwxkzz57gap7oxdm6kbj|2025-11-15 22:37:47.322|     31|
|rbneaqi9nfjd68chubj6xu92|2025-11-15 22:39:19.488|     32|
|gcjnj6nn319x13ux4svsacak|2025-11-15 22:40:17.733|     33|
|aw3u5bocxhwq1y6wwm2soety|2025-11-15 22:45:15.007|     34|
|d1321kn6evtxu82fcb2e7604|2025-11-15 22:46:23.769|     35|
|lqjmjrqtapml6qgzoa6n8m6y|2025-11-15 22:47:55.592|     36|
|fze2ilei8mv9j9wm3sor8sa6|2025-11-15 22:48:05.186|     37|
|w4rtnra1u70zkbunw8nhnnfx|2025-11-15 22:53:53.781|     38|
|b10dv12yez24qn720czlh4zx|2025-11-15 22:54:04.810|     39|
|v6q6ck4y7fzxr3vksla856og|2025-11-15 22:56:01.423|     40|
|y8p9lezluhgzua298ml5grnn|2025-11-15 22:57:12.309|     41|
|etmimrh1at1mz9lhdah74ycj|2025-11-15 23:32:25.131|     42|
|v8rynwe4lnmtnzn6amip8uj4|2025-11-15 23:33:40.758|     43|
|ej85vu7u9x2rmbym8p6tk2uk|2025-11-15 23:54:55.931|     44|
|lcexjscibnuoj0rof5k5pyjj|2025-11-15 23:56:02.828|     45|
|uwg5k61059nv4ay42i9wk47a|2025-11-16 00:00:30.072|     46|
|rqymmna8q923px2co4dvs7pq|2025-11-16 00:01:43.407|     47|
|q41h803pn8hj6rzphjh4fma1|2025-11-16 00:08:04.892|     48|
|nsnomnd2b9zyyzq2tjpz5tab|2025-11-16 00:08:40.662|     49|
|wzzjqeqv6r1pmdjkv8gl49js|2025-11-16 00:14:36.705|     50|
|vbk2jdvv20qs9apxqi0rtatm|2025-11-16 00:14:50.401|     51|
|c12wtk0nlu92891cxle7k5lc|2025-11-16 00:16:29.297|     52|
|zps78dmz3cnztdktuwii1ica|2025-11-16 00:17:27.611|     53|
|gg2mphm0e077pf7bnet46vg6|2025-11-16 00:30:30.091|     54|
|gocx95xcr5jvc9o1ic2r77df|2025-11-16 00:31:47.580|     55|
+------------------------+-----------------------+-------+
```
