package com.banma.custom;

import android.os.Parcel;
import android.os.Parcelable;

/** CustomResponse — typed-parcelable, same layout as CustomMessage (reverse-engineered 2026-08-17). */
public class CustomResponse implements Parcelable {
    public String id;
    public String content;
    public String senderId;
    public long timestamp;

    public CustomResponse() {}

    @Override public int describeContents() { return 0; }

    @Override public void writeToParcel(Parcel dest, int flags) {
        int start = dest.dataPosition();
        dest.writeInt(0);
        dest.writeString(id);
        dest.writeString(content);
        dest.writeString(senderId);
        dest.writeLong(timestamp);
        int end = dest.dataPosition();
        dest.setDataPosition(start);
        dest.writeInt(end - start);
        dest.setDataPosition(end);
    }

    public void readFromParcel(Parcel in) {
        int size = in.readInt();
        if (size == 0) return;
        id = in.readString();
        content = in.readString();
        senderId = in.readString();
        timestamp = in.readLong();
    }

    public static final Creator<CustomResponse> CREATOR = new Creator<CustomResponse>() {
        @Override public CustomResponse createFromParcel(Parcel in) { CustomResponse r = new CustomResponse(); r.readFromParcel(in); return r; }
        @Override public CustomResponse[] newArray(int size) { return new CustomResponse[size]; }
    };
}
