import { db } from "./db";
import { posts, postLikes, postTips, follows, postEngagements, users, type Post, type User } from "@shared/schema";
import { eq, desc, sql, and, gte, inArray } from "drizzle-orm";

interface ScoredPost {
  postId: string;
  score: number;
  signals: {
    recency: number;
    engagement: number;
    creatorAffinity: number;
    contentMatch: number;
    watchTimeQuality: number;
  };
}

interface PostCandidate {
  id: string;
  authorId: string;
  content: string | null;
  mediaType: string | null;
  likesCount: string | null;
  commentsCount: string | null;
  tipsTotal: string | null;
  viewsCount: string | null;
  durationSeconds: number | null;
  createdAt: Date | null;
  source: "fresh" | "trending" | "followed" | "similar";
}

const WEIGHTS = {
  recency: 0.20,
  engagement: 0.25,
  creatorAffinity: 0.20,
  contentMatch: 0.15,
  watchTimeQuality: 0.20,
};

const DECAY_HALF_LIFE_HOURS = 24;

export class RecommenderService {
  async getRecommendedFeed(userId: string, limit: number = 20): Promise<ScoredPost[]> {
    const candidates = await this.generateCandidates(userId, limit * 3);
    const userContext = await this.getUserContext(userId);
    const scored = await this.scoreAndRank(candidates, userContext);
    return scored.slice(0, limit);
  }

  private async generateCandidates(userId: string, targetCount: number): Promise<PostCandidate[]> {
    const candidates: PostCandidate[] = [];
    const seenIds = new Set<string>();

    const addCandidates = (posts: PostCandidate[]) => {
      for (const post of posts) {
        if (!seenIds.has(post.id) && post.authorId !== userId) {
          seenIds.add(post.id);
          candidates.push(post);
        }
      }
    };

    const [fresh, trending, followed] = await Promise.all([
      this.getFreshPosts(targetCount / 3),
      this.getTrendingPosts(targetCount / 3),
      this.getFollowedCreatorPosts(userId, targetCount / 3),
    ]);

    addCandidates(fresh.map(p => ({ ...p, source: "fresh" as const })));
    addCandidates(trending.map(p => ({ ...p, source: "trending" as const })));
    addCandidates(followed.map(p => ({ ...p, source: "followed" as const })));

    if (candidates.length < targetCount) {
      const similar = await this.getSimilarPosts(userId, targetCount - candidates.length);
      addCandidates(similar.map(p => ({ ...p, source: "similar" as const })));
    }

    return candidates;
  }

  private async getFreshPosts(limit: number): Promise<Omit<PostCandidate, "source">[]> {
    const result = await db.select({
      id: posts.id,
      authorId: posts.authorId,
      content: posts.content,
      mediaType: posts.mediaType,
      likesCount: posts.likesCount,
      commentsCount: posts.commentsCount,
      tipsTotal: posts.tipsTotal,
      viewsCount: posts.viewsCount,
      durationSeconds: posts.durationSeconds,
      createdAt: posts.createdAt,
    })
      .from(posts)
      .where(eq(posts.visibility, "public"))
      .orderBy(desc(posts.createdAt))
      .limit(Math.ceil(limit));

    return result;
  }

  private async getTrendingPosts(limit: number): Promise<Omit<PostCandidate, "source">[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await db.select({
      id: posts.id,
      authorId: posts.authorId,
      content: posts.content,
      mediaType: posts.mediaType,
      likesCount: posts.likesCount,
      commentsCount: posts.commentsCount,
      tipsTotal: posts.tipsTotal,
      viewsCount: posts.viewsCount,
      durationSeconds: posts.durationSeconds,
      createdAt: posts.createdAt,
    })
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        gte(posts.createdAt, oneDayAgo)
      ))
      .orderBy(desc(sql`(
        COALESCE(NULLIF(${posts.likesCount}, '')::integer, 0) * 2 +
        COALESCE(NULLIF(${posts.commentsCount}, '')::integer, 0) * 3 +
        COALESCE(NULLIF(${posts.tipsTotal}, '')::numeric, 0) * 10 +
        COALESCE(NULLIF(${posts.viewsCount}, '')::integer, 0) * 0.1
      ) / GREATEST(EXTRACT(EPOCH FROM (NOW() - ${posts.createdAt})) / 3600, 1)`))
      .limit(Math.ceil(limit));

    return result;
  }

  private async getFollowedCreatorPosts(userId: string, limit: number): Promise<Omit<PostCandidate, "source">[]> {
    const following = await db.select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    if (following.length === 0) return [];

    const followingIds = following.map(f => f.followingId);

    const result = await db.select({
      id: posts.id,
      authorId: posts.authorId,
      content: posts.content,
      mediaType: posts.mediaType,
      likesCount: posts.likesCount,
      commentsCount: posts.commentsCount,
      tipsTotal: posts.tipsTotal,
      viewsCount: posts.viewsCount,
      durationSeconds: posts.durationSeconds,
      createdAt: posts.createdAt,
    })
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        inArray(posts.authorId, followingIds)
      ))
      .orderBy(desc(posts.createdAt))
      .limit(Math.ceil(limit));

    return result;
  }

  private async getSimilarPosts(userId: string, limit: number): Promise<Omit<PostCandidate, "source">[]> {
    const likedPosts = await db.select({ postId: postLikes.postId })
      .from(postLikes)
      .where(eq(postLikes.userId, userId))
      .orderBy(desc(postLikes.createdAt))
      .limit(10);

    if (likedPosts.length === 0) return [];

    const likedIds = likedPosts.map(l => l.postId);
    const likedPostData = await db.select({ authorId: posts.authorId })
      .from(posts)
      .where(inArray(posts.id, likedIds));

    const likedAuthors = [...new Set(likedPostData.map(p => p.authorId))];
    if (likedAuthors.length === 0) return [];

    const result = await db.select({
      id: posts.id,
      authorId: posts.authorId,
      content: posts.content,
      mediaType: posts.mediaType,
      likesCount: posts.likesCount,
      commentsCount: posts.commentsCount,
      tipsTotal: posts.tipsTotal,
      viewsCount: posts.viewsCount,
      durationSeconds: posts.durationSeconds,
      createdAt: posts.createdAt,
    })
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        inArray(posts.authorId, likedAuthors),
        sql`${posts.id} NOT IN (${likedIds.map(id => `'${id}'`).join(",")})`
      ))
      .orderBy(desc(posts.createdAt))
      .limit(Math.ceil(limit));

    return result;
  }

  private async getUserContext(userId: string): Promise<UserContext> {
    const [likedPosts, followedUsers, recentTips] = await Promise.all([
      db.select({ postId: postLikes.postId, authorId: posts.authorId })
        .from(postLikes)
        .innerJoin(posts, eq(postLikes.postId, posts.id))
        .where(eq(postLikes.userId, userId))
        .limit(100),
      
      db.select({ followingId: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId)),
      
      db.select({ authorId: posts.authorId, amount: postTips.amount })
        .from(postTips)
        .innerJoin(posts, eq(postTips.postId, posts.id))
        .where(eq(postTips.fromUserId, userId))
        .limit(50),
    ]);

    const creatorAffinities = new Map<string, number>();
    
    for (const like of likedPosts) {
      const current = creatorAffinities.get(like.authorId) || 0;
      creatorAffinities.set(like.authorId, current + 1);
    }
    
    for (const follow of followedUsers) {
      const current = creatorAffinities.get(follow.followingId) || 0;
      creatorAffinities.set(follow.followingId, current + 5);
    }
    
    for (const tip of recentTips) {
      const current = creatorAffinities.get(tip.authorId) || 0;
      creatorAffinities.set(tip.authorId, current + parseFloat(tip.amount) * 2);
    }

    return {
      likedPostIds: new Set(likedPosts.map(l => l.postId)),
      followedCreatorIds: new Set(followedUsers.map(f => f.followingId)),
      creatorAffinities,
    };
  }

  private async scoreAndRank(candidates: PostCandidate[], context: UserContext): Promise<ScoredPost[]> {
    const now = Date.now();
    const scored: ScoredPost[] = [];
    
    const postIds = candidates.map(c => c.id);
    const engagementStats = await this.getEngagementStats(postIds);

    for (const candidate of candidates) {
      const recencyScore = this.calculateRecencyScore(candidate.createdAt, now);
      const engagementScore = this.calculateEngagementScore(candidate);
      const creatorAffinityScore = this.calculateCreatorAffinityScore(candidate.authorId, context);
      const contentMatchScore = this.calculateContentMatchScore(candidate, context);
      const watchTimeQualityScore = this.calculateWatchTimeQualityScore(candidate, engagementStats.get(candidate.id));

      const totalScore = 
        recencyScore * WEIGHTS.recency +
        engagementScore * WEIGHTS.engagement +
        creatorAffinityScore * WEIGHTS.creatorAffinity +
        contentMatchScore * WEIGHTS.contentMatch +
        watchTimeQualityScore * WEIGHTS.watchTimeQuality;

      scored.push({
        postId: candidate.id,
        score: totalScore,
        signals: {
          recency: recencyScore,
          engagement: engagementScore,
          creatorAffinity: creatorAffinityScore,
          contentMatch: contentMatchScore,
          watchTimeQuality: watchTimeQualityScore,
        },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
  
  private async getEngagementStats(postIds: string[]): Promise<Map<string, EngagementStat>> {
    if (postIds.length === 0) return new Map();
    
    const stats = await db.select({
      postId: postEngagements.postId,
      avgCompletion: sql<number>`COALESCE(AVG(${postEngagements.completionPercentage}), 0)`,
      avgWatchTime: sql<number>`COALESCE(AVG(${postEngagements.watchTimeSeconds}), 0)`,
      viewCount: sql<number>`COUNT(${postEngagements.id})::integer`,
    })
      .from(postEngagements)
      .where(inArray(postEngagements.postId, postIds))
      .groupBy(postEngagements.postId);
    
    const result = new Map<string, EngagementStat>();
    for (const stat of stats) {
      result.set(stat.postId, {
        avgCompletionPercentage: Number(stat.avgCompletion) || 0,
        avgWatchTimeSeconds: Number(stat.avgWatchTime) || 0,
        viewCount: Number(stat.viewCount) || 0,
      });
    }
    return result;
  }
  
  private calculateWatchTimeQualityScore(candidate: PostCandidate, stats?: EngagementStat): number {
    if (!stats) {
      return 0.5;
    }
    
    let score = 0.5;
    
    if (candidate.mediaType === "video" && candidate.durationSeconds) {
      const completionRate = stats.avgCompletionPercentage / 100;
      score += completionRate * 0.3;
      
      const expectedWatchTime = candidate.durationSeconds * 0.5;
      const watchTimeRatio = Math.min(1, stats.avgWatchTimeSeconds / expectedWatchTime);
      score += watchTimeRatio * 0.2;
    } else {
      const views = parseInt(candidate.viewsCount || "0");
      if (views > 0 && stats.viewCount > 0) {
        score += Math.min(0.3, stats.viewCount / views * 0.3);
      }
    }
    
    return Math.min(1, score);
  }

  private calculateRecencyScore(createdAt: Date | null, now: number): number {
    if (!createdAt) return 0;
    const ageHours = (now - createdAt.getTime()) / (1000 * 60 * 60);
    return Math.pow(0.5, ageHours / DECAY_HALF_LIFE_HOURS);
  }

  private calculateEngagementScore(candidate: PostCandidate): number {
    const likes = parseInt(candidate.likesCount || "0");
    const comments = parseInt(candidate.commentsCount || "0");
    const tips = parseFloat(candidate.tipsTotal || "0");
    
    const rawScore = likes + comments * 2 + tips * 10;
    return Math.min(1, rawScore / 100);
  }

  private calculateCreatorAffinityScore(authorId: string, context: UserContext): number {
    const affinity = context.creatorAffinities.get(authorId) || 0;
    if (context.followedCreatorIds.has(authorId)) {
      return Math.min(1, 0.5 + affinity / 20);
    }
    return Math.min(1, affinity / 20);
  }

  private calculateContentMatchScore(candidate: PostCandidate, context: UserContext): number {
    if (context.likedPostIds.has(candidate.id)) {
      return 0;
    }
    
    let score = 0.5;
    
    if (candidate.source === "followed") {
      score += 0.2;
    } else if (candidate.source === "similar") {
      score += 0.15;
    } else if (candidate.source === "trending") {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }

  async getTrendingFeed(userId: string, limit: number = 50): Promise<(Post & { author: User; isLiked: boolean })[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const trendingPosts = await db.select()
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        gte(posts.createdAt, oneDayAgo)
      ))
      .orderBy(desc(sql`(
        COALESCE(NULLIF(${posts.likesCount}, '')::integer, 0) * 2 +
        COALESCE(NULLIF(${posts.commentsCount}, '')::integer, 0) * 3 +
        COALESCE(NULLIF(${posts.tipsTotal}, '')::numeric, 0) * 10 +
        COALESCE(NULLIF(${posts.viewsCount}, '')::integer, 0) * 0.1
      ) / EXTRACT(EPOCH FROM (NOW() - ${posts.createdAt})) * 3600`))
      .limit(limit);
    
    const postsWithAuthors = await Promise.all(
      trendingPosts.map(async (post) => {
        const author = await this.getUserById(post.authorId);
        const isLiked = await this.hasUserLikedPost(post.id, userId);
        return {
          ...post,
          author: author!,
          isLiked,
        };
      })
    );
    
    return postsWithAuthors;
  }

  async getFollowingFeed(userId: string, limit: number = 50): Promise<(Post & { author: User; isLiked: boolean })[]> {
    const following = await db.select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    if (following.length === 0) {
      return [];
    }

    const followingIds = following.map(f => f.followingId);

    const followingPosts = await db.select()
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        inArray(posts.authorId, followingIds)
      ))
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    const postsWithAuthors = await Promise.all(
      followingPosts.map(async (post) => {
        const author = await this.getUserById(post.authorId);
        const isLiked = await this.hasUserLikedPost(post.id, userId);
        return {
          ...post,
          author: author!,
          isLiked,
        };
      })
    );

    return postsWithAuthors;
  }

  private async getUserById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  private async hasUserLikedPost(postId: string, userId: string): Promise<boolean> {
    const [existing] = await db.select()
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    return !!existing;
  }
}

interface UserContext {
  likedPostIds: Set<string>;
  followedCreatorIds: Set<string>;
  creatorAffinities: Map<string, number>;
}

interface EngagementStat {
  avgCompletionPercentage: number;
  avgWatchTimeSeconds: number;
  viewCount: number;
}

export const recommenderService = new RecommenderService();
