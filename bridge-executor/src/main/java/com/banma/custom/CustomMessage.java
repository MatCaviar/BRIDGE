package com.banma.custom;

import android.os.Parcel;
import android.os.Parcelable;

/** CustomMessage — typed-parcelable (reverse-engineered 2026-08-17): id, content(JSON), senderId, timestamp. */
public class CustomMessage implements Parcelable {
    public String id;
    public String content;
    public String senderId;
    public long timestamp;

    public CustomMessage() {}

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

    public static final Creator<CustomMessage> CREATOR = new Creator<CustomMessage>() {
        @Override public CustomMessage createFromParcel(Parcel in) { CustomMessage m = new CustomMessage(); m.readFromParcel(in); return m; }
        @Override public CustomMessage[] newArray(int size) { return new CustomMessage[size]; }
    };
}
