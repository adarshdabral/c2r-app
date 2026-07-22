import { useEffect, useState } from "react";
import { View } from "react-native";
import { Pencil, Trash2 } from "lucide-react-native";
import { api, type Review, type StoreReviewsResponse } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Text,
  Button,
  Textarea,
  Surface,
  LoadingState,
} from "@/components/ui";
import { StarRow, StarPicker } from "@/components/Stars";
import { useAuth } from "@/context/AuthContext";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Store reviews: average + total, the recent-reviews list, and — for a logged-in
 * `user` — an inline add/edit/delete form. Mirrors the web StoreReviews logic
 * and endpoints exactly.
 */
export function StoreReviews({ storeId }: { storeId: number }) {
  const { role, isAuthenticated } = useAuth();
  const isUser = isAuthenticated && role === "user";

  const [summary, setSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadReviews = async () => {
    const { data } = await api.get<StoreReviewsResponse>(
      `/stores/${storeId}/reviews`
    );
    setSummary({
      averageRating: data.averageRating,
      totalReviews: data.totalReviews,
    });
    setReviews(data.reviews);
  };

  const loadMine = async () => {
    try {
      const { data } = await api.get<{ review: Review | null }>(
        `/stores/${storeId}/reviews/mine`
      );
      setMyReview(data.review);
    } catch {
      setMyReview(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadReviews();
        if (isUser) await loadMine();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const startEdit = () => {
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? "");
    setError("");
    setEditing(true);
  };

  const refresh = async () => {
    await Promise.all([loadReviews(), loadMine()]);
  };

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      setError("Please select a rating between 1 and 5 stars.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body = { rating, comment: comment.trim() || null };
      if (myReview) {
        await api.put(`/stores/${storeId}/reviews/${myReview.id}`, body);
      } else {
        await api.post(`/stores/${storeId}/reviews`, body);
      }
      await refresh();
      setEditing(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Could not save your review. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!myReview) return;
    setSubmitting(true);
    setError("");
    try {
      await api.delete(`/stores/${storeId}/reviews/${myReview.id}`);
      await refresh();
      setEditing(false);
      setRating(0);
      setComment("");
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "Could not delete your review. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Reviews</CardTitle>
      </CardHeader>
      <CardContent className="gap-5">
        {/* Summary */}
        <View className="flex-row items-center gap-4">
          <View className="items-center">
            <Text className="text-[30px] font-bold">
              {summary.averageRating.toFixed(1)}
            </Text>
            <Text className="text-[12px] text-muted-foreground">out of 5</Text>
          </View>
          <View className="gap-1">
            <StarRow value={summary.averageRating} />
            <Text className="text-[13px] text-muted-foreground">
              {summary.totalReviews}{" "}
              {summary.totalReviews === 1 ? "review" : "reviews"}
            </Text>
          </View>
        </View>

        {/* Write / edit / delete */}
        {isUser ? (
          <Surface variant="inset" className="p-4">
            {!editing ? (
              myReview ? (
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-[12px] font-medium">Your review</Text>
                    <StarRow value={myReview.rating} />
                    {myReview.comment ? (
                      <Text className="text-[13px] text-muted-foreground">
                        {myReview.comment}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row gap-1">
                    <Button size="icon" variant="ghost" onPress={startEdit}>
                      <Pencil size={16} color="#14181a" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onPress={handleDelete}
                      disabled={submitting}
                    >
                      <Trash2 size={16} color="#ff3b30" />
                    </Button>
                  </View>
                </View>
              ) : (
                <Button size="sm" variant="outline" onPress={startEdit}>
                  Write a review
                </Button>
              )
            ) : (
              <View className="gap-3">
                <StarPicker value={rating} onChange={setRating} />
                <Textarea
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Share your experience (optional)"
                  maxLength={1000}
                />
                {error ? (
                  <Text className="text-[13px] text-destructive">{error}</Text>
                ) : null}
                <View className="flex-row gap-2">
                  <Button size="sm" onPress={handleSubmit} loading={submitting}>
                    {myReview ? "Save changes" : "Submit review"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setEditing(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </View>
              </View>
            )}
            {!editing && error ? (
              <Text className="mt-2 text-[13px] text-destructive">{error}</Text>
            ) : null}
          </Surface>
        ) : null}

        {/* Recent reviews */}
        {loading ? (
          <LoadingState label="Loading reviews…" />
        ) : reviews.length === 0 ? (
          <Text className="text-[13px] italic text-muted-foreground">
            No reviews yet. Be the first to review this store.
          </Text>
        ) : (
          <View className="gap-4">
            <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent reviews
            </Text>
            {reviews.map((r) => (
              <View key={r.id} className="gap-1.5 rounded-2xl border border-border p-4">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-[13px] font-semibold">
                    {r.userName ?? "User"}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </Text>
                </View>
                <StarRow value={r.rating} />
                {r.comment ? (
                  <Text className="text-[13px] text-muted-foreground">
                    {r.comment}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
